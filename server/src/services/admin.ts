import { z } from "zod";
import { getProvider } from "../ai/index.js";
import { badRequest } from "../lib/errors.js";
import type { UserDoc } from "../models/User.js";
import { quoteFound, UNTRUSTED_RULE, wrapUntrusted } from "./ai-common.js";
import { getDocumentPages } from "./documents.js";
import { todayInTz } from "../lib/dates.js";

const AdminAnalysisSchema = z.object({
  plainEnglishSummary: z.string(),
  sender: z.string().nullable(),
  documentType: z.string().describe("e.g. Rundfunkbeitrag letter, Krankenkasse notice, Mietvertrag, university email"),
  purpose: z.string(),
  facts: z.array(z.object({ statement: z.string().describe("A substantive fact stated in the document (not the greeting, salutation or sign-off)"), quote: z.string().describe("The shortest exact sentence or phrase from the document that supports this fact (one sentence, not a whole paragraph), copied verbatim in the original language"), page: z.number().int().nullable() })),
  interpretations: z.array(z.object({ statement: z.string().describe("Your interpretation or advice, not stated in the document"), confidence: z.enum(["high", "medium", "low"]) })),
  deadlines: z.array(z.object({ date: z.string().nullable().describe("YYYY-MM-DD, null if relative or unclear"), description: z.string(), quote: z.string() })),
  actions: z.array(
    z.object({ title: z.string().describe("Short task title in English"), dueDate: z.string().nullable().describe("YYYY-MM-DD or null"), priority: z.enum(["low", "medium", "high", "urgent"]), reason: z.string() }),
  ),
  requiredDocuments: z.array(z.string()),
  uncertainties: z.array(z.string()).describe("Legal or administrative points that need confirmation from the sender, a lawyer or an advice centre"),
  draftReplyGerman: z.string().nullable().describe("A German reply written BY the student TO the organisation in `sender`: name that organisation in the greeting (e.g. \"Sehr geehrte Damen und Herren der Techniker Krankenkasse,\"), sign with the student's real name, and never claim the student has already done something the document asks for. Null if no reply is needed"),
  draftReplyEnglish: z.string().nullable().describe("English translation of the reply"),
});

/**
 * Small local models often leave the greeting or signature as a placeholder ("Sehr geehrte [Name des Absenders]").
 * Replace those with the standard formal greeting for an organisation and the user's own name.
 */
export function fixReplyPlaceholders(reply: string | null, userName: string): string | null {
  if (!reply) return reply;
  return reply
    .replace(/^(\s*)Sehr geehrte[rs]?\s*(?:Damen und Herren\s*)?\[[^\]\n]*\]\s*,?/i, "$1Sehr geehrte Damen und Herren,")
    .replace(/\[(?:Ihr(?:e)? Name|Name des Absenders|Absender(?:name)?|Dein Name|Vorname Nachname|Name)\]/gi, userName);
}

export async function analyzeAdminDocument(user: UserDoc, documentId: string) {
  const { doc, chunks } = await getDocumentPages(user, documentId);
  if (!chunks.length) throw badRequest(doc.statusMessage || "This document has no extractable text.");
  const pages = new Map<number, string>();
  for (const c of chunks) pages.set(c.page, (pages.get(c.page) ?? "") + " " + c.text);
  const fullText = [...pages.entries()].map(([p, t]) => `[Page ${p}]\n${t.trim()}`).join("\n\n");
  if (fullText.length > 200_000) throw badRequest("This document is too long to analyse in one go (over ~50 pages).");

  const analysis = await getProvider().generateObject({
    system: `You explain German official letters, emails, insurance, rental and university documents to an international student in Köln (today is ${todayInTz(user.timezone)}). Separate what the document actually says (facts, with exact quotes) from your interpretations. Never present legal conclusions as certain; list them as uncertainties. Never invent dates, amounts or reference numbers. If a reply is needed, write it from the student to the sending organisation: start with "Sehr geehrte Damen und Herren," (or the named contact person), sign with the student's name, and describe only future actions, never claim something is already done. ${UNTRUSTED_RULE}`,
    schema: AdminAnalysisSchema,
    prompt: `Analyse this document titled "${doc.title}". The student who received it is ${user.name}; any reply is written by ${user.name} (sign with this name, not a placeholder) and addressed to the organisation or person who sent the document. Only use placeholders like [Versichertennummer] for details that are not in the document.\n\n${wrapUntrusted(fullText)}`,
  });
  // Mark which quotes really occur in the document, so the UI can flag unverifiable ones.
  const facts = analysis.facts.map((f) => ({ ...f, verified: quoteFound(f.quote, fullText) }));
  const deadlines = analysis.deadlines.map((d) => ({ ...d, verified: quoteFound(d.quote, fullText) }));
  const draftReplyGerman = fixReplyPlaceholders(analysis.draftReplyGerman, user.name);
  const stored = { ...analysis, draftReplyGerman, facts, deadlines, generatedAt: new Date().toISOString(), model: getProvider().model };
  doc.analysis = stored;
  await doc.save();
  return stored;
}
