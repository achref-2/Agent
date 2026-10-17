import { z } from "zod";
import { getProvider } from "../ai/index.js";
import { addDays, todayInTz } from "../lib/dates.js";
import { badRequest } from "../lib/errors.js";
import { Chunk, DocumentModel } from "../models/Document.js";
import { StudyTopic } from "../models/misc.js";
import { Task } from "../models/Task.js";
import type { UserDoc } from "../models/User.js";
import { quoteFound, UNTRUSTED_RULE, wrapUntrusted } from "./ai-common.js";
import { getDocument, getDocumentPages } from "./documents.js";
import { retrievePassages, type Passage } from "./retrieval.js";

const LEVELS = { beginner: "a beginner: plain language, intuition first, small examples", advanced: "an advanced student: precise terminology and formal detail" };
export type Level = keyof typeof LEVELS;

const STUDY_SYSTEM = `You are GhostMate's study assistant for a Master's student in Informatik at TH Köln. You answer only from the provided lecture passages when asked about the user's materials. ${UNTRUSTED_RULE}`;

async function titlesFor(user: UserDoc, ids: string[]) {
  const docs = await DocumentModel.find({ userId: user._id, _id: { $in: ids } }).select("title");
  return new Map(docs.map((d) => [String(d._id), d.title]));
}

function formatPassages(passages: Passage[], titles: Map<string, string>) {
  return passages
    .map((p, i) => `[Passage ${i + 1}] ${titles.get(p.documentId) ?? "Document"}, page ${p.page}\n${wrapUntrusted(p.text)}`)
    .join("\n\n");
}

const AnswerSchema = z.object({
  answer: z.string().describe("Markdown answer. Cite passages inline like [1], [2]."),
  answeredFromSources: z.boolean().describe("false if the passages do not contain the answer"),
  citations: z.array(z.object({ passage: z.number().int().describe("Passage number"), quote: z.string().describe("Short exact quote from that passage") })),
  generalKnowledgeNote: z.string().nullable().describe("If you add general knowledge not in the passages, say so here; otherwise null"),
});

export async function askDocuments(user: UserDoc, input: { question: string; documentIds?: string[]; level?: Level }) {
  const passages = await retrievePassages(user._id, input.question, { documentIds: input.documentIds, limit: 8 });
  if (!passages.length) {
    return {
      answer: "I could not find anything relevant to this question in your documents, so I can't answer it from your materials.",
      answeredFromSources: false,
      citations: [],
      generalKnowledgeNote: null,
      passagesConsidered: 0,
    };
  }
  const titles = await titlesFor(user, [...new Set(passages.map((p) => p.documentId))]);
  const out = await getProvider().generateObject({
    system: STUDY_SYSTEM,
    schema: AnswerSchema,
    prompt: `Question: ${input.question}\n\nExplain for ${LEVELS[input.level ?? "beginner"]}.\nUse only these passages for claims about the lecture. If they do not answer the question, set answeredFromSources=false and say so. Keep general knowledge clearly separated and mention it in generalKnowledgeNote.\n\n${formatPassages(passages, titles)}`,
  });
  const citations = out.citations
    .filter((c) => c.passage >= 1 && c.passage <= passages.length)
    .map((c) => {
      const p = passages[c.passage - 1];
      return { passage: c.passage, documentId: p.documentId, documentTitle: titles.get(p.documentId) ?? "", page: p.page, quote: c.quote, verified: quoteFound(c.quote, p.text) };
    });
  return { ...out, citations, passagesConsidered: passages.length };
}

const MAX_SINGLE_PASS = 120_000;

export async function summarizeDocument(user: UserDoc, documentId: string, level: Level = "beginner") {
  const { doc, chunks } = await getDocumentPages(user, documentId);
  if (!chunks.length) throw badRequest(doc.statusMessage || "This document has no extractable text to summarize.");
  // Rebuild page text (chunks overlap slightly, which is harmless for summarizing).
  const pages = new Map<number, string>();
  for (const c of chunks) pages.set(c.page, (pages.get(c.page) ?? "") + " " + c.text);
  const pageTexts = [...pages.entries()].map(([page, text]) => `[Page ${page}]\n${text.trim()}`);
  const provider = getProvider();
  const instruction = `Summarize lecture material for ${LEVELS[level]}. Use Markdown: a short overview, then key concepts as headings with bullet points, important formulas or definitions, and a "Likely exam topics" list. Reference pages as (p. N). Only include what the material says.`;

  const groups: string[] = [];
  let current = "";
  for (const p of pageTexts) {
    if (current.length + p.length > MAX_SINGLE_PASS && current) {
      groups.push(current);
      current = "";
    }
    current += p + "\n\n";
  }
  if (current) groups.push(current);

  let summary: string;
  if (groups.length === 1) {
    summary = await provider.generateText({ system: STUDY_SYSTEM, prompt: `${instruction}\n\nDocument "${doc.title}":\n${wrapUntrusted(groups[0])}` });
  } else {
    // Map-reduce for long documents: summarize sections, then merge.
    const partials: string[] = [];
    for (const [i, g] of groups.entries()) {
      partials.push(
        await provider.generateText({
          system: STUDY_SYSTEM,
          prompt: `Summarize part ${i + 1} of ${groups.length} of "${doc.title}" as detailed bullet points with (p. N) references.\n${wrapUntrusted(g)}`,
        }),
      );
    }
    summary = await provider.generateText({
      system: STUDY_SYSTEM,
      prompt: `${instruction}\n\nMerge these partial summaries of "${doc.title}" into one summary, keeping page references:\n\n${partials.join("\n\n---\n\n")}`,
    });
  }
  doc.summary = summary;
  await doc.save();
  return { summary };
}

export async function explainConcept(user: UserDoc, input: { concept: string; level: Level; documentIds?: string[] }) {
  if (input.documentIds?.length) {
    const r = await askDocuments(user, { question: `Explain: ${input.concept}`, documentIds: input.documentIds, level: input.level });
    return { explanation: r.answer, citations: r.citations, answeredFromSources: r.answeredFromSources, generalKnowledgeNote: r.generalKnowledgeNote };
  }
  const explanation = await getProvider().generateText({
    system: STUDY_SYSTEM,
    prompt: `Explain "${input.concept}" for ${LEVELS[input.level]}. Include an intuitive explanation, a worked example, common pitfalls and a quick self-check question with answer. This is general knowledge, not from the user's slides.`,
  });
  return { explanation, citations: [], answeredFromSources: false, generalKnowledgeNote: "General explanation, not based on your uploaded materials." };
}

const QuizSchema = z.object({
  items: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()).describe("Exactly 4 options"),
      correctIndex: z.number().int().describe("0-3"),
      explanation: z.string(),
      topic: z.string(),
      page: z.number().int().nullable(),
    }),
  ),
});
const FlashcardSchema = z.object({
  items: z.array(z.object({ front: z.string(), back: z.string(), topic: z.string(), page: z.number().int().nullable() })),
});
const ExerciseSchema = z.object({
  items: z.array(
    z.object({ prompt: z.string(), solution: z.string(), difficulty: z.enum(["easy", "medium", "hard"]), topic: z.string(), page: z.number().int().nullable() }),
  ),
});

export type MaterialType = "quiz" | "flashcards" | "exercises";

async function sampleMaterial(user: UserDoc, documentId: string, topic?: string) {
  const doc = await getDocument(user, documentId);
  if (topic) {
    const passages = await retrievePassages(user._id, topic, { documentIds: [documentId], limit: 10 });
    if (passages.length) return { doc, text: passages.map((p) => `[Page ${p.page}]\n${p.text}`).join("\n\n") };
  }
  const chunks = await Chunk.find({ userId: user._id, documentId: doc._id }).sort({ index: 1 }).lean();
  if (!chunks.length) throw badRequest(doc.statusMessage || "This document has no extractable text.");
  // Evenly sample up to ~40k characters across the whole document.
  const budget = 40_000;
  const step = Math.max(1, Math.ceil(chunks.reduce((s, c) => s + c.text.length, 0) / budget));
  const picked = chunks.filter((_, i) => i % step === 0);
  return { doc, text: picked.map((c) => `[Page ${c.page}]\n${c.text}`).join("\n\n") };
}

export async function generateMaterial(user: UserDoc, input: { documentId: string; type: MaterialType; count: number; topic?: string; level: Level }) {
  const { doc, text } = await sampleMaterial(user, input.documentId, input.topic);
  const what =
    input.type === "quiz"
      ? `${input.count} multiple-choice questions with exactly 4 options each`
      : input.type === "flashcards"
        ? `${input.count} flashcards (concise front, clear back)`
        : `${input.count} practice exercises with full worked solutions`;
  const schema = input.type === "quiz" ? QuizSchema : input.type === "flashcards" ? FlashcardSchema : ExerciseSchema;
  const out = await getProvider().generateObject({
    system: STUDY_SYSTEM,
    schema,
    prompt: `Create ${what} for ${LEVELS[input.level]} based only on this material from "${doc.title}"${input.topic ? `, focused on "${input.topic}"` : ""}. Give the page number each item is based on. Do not test facts that are not in the material.\n\n${wrapUntrusted(text)}`,
  });
  return { documentTitle: doc.title, type: input.type, items: out.items };
}

export async function recordTopicResult(user: UserDoc, input: { topic: string; course?: string; correct: boolean }) {
  const t = await StudyTopic.findOneAndUpdate(
    { userId: user._id, name: input.topic.slice(0, 160) },
    { $inc: { attempts: 1, correct: input.correct ? 1 : 0 }, $setOnInsert: { course: input.course ?? "" } },
    { upsert: true, new: true },
  );
  t.struggling = t.attempts >= 2 && t.correct / t.attempts < 0.6;
  await t.save();
  return t;
}

const PlanSchema = z.object({
  overview: z.string(),
  days: z.array(
    z.object({
      date: z.string().describe("YYYY-MM-DD"),
      sessions: z.array(z.object({ topic: z.string(), minutes: z.number().int(), activity: z.string() })),
    }),
  ),
  notes: z.array(z.string()),
});

export async function revisionPlan(user: UserDoc, input: { goal: string; endDate: string; minutesPerDay: number; topics?: string[] }) {
  const today = todayInTz(user.timezone);
  if (input.endDate < today) throw badRequest("The end date is in the past");
  if (input.endDate > addDays(today, 60)) throw badRequest("Plans can cover at most 60 days");
  const [deadlines, struggling] = await Promise.all([
    Task.find({ userId: user._id, status: { $in: ["todo", "in_progress"] }, category: "university", dueDate: { $gte: today, $lte: input.endDate } })
      .sort({ dueDate: 1 })
      .select("title dueDate priority"),
    StudyTopic.find({ userId: user._id, struggling: true }).select("name attempts correct"),
  ]);
  const plan = await getProvider().generateObject({
    system: STUDY_SYSTEM,
    schema: PlanSchema,
    prompt: `Create a realistic revision plan from ${today} to ${input.endDate}. Goal: ${input.goal}. Available study time: about ${input.minutesPerDay} minutes per day; never exceed it. Include short reviews (spaced repetition) and a lighter day before deadlines.
Topics the user named: ${input.topics?.join(", ") || "none given"}.
Topics the user struggles with (from quiz results): ${struggling.map((s) => `${s.name} (${s.correct}/${s.attempts} correct)`).join(", ") || "none recorded"}.
University deadlines in the database: ${deadlines.map((d) => `${d.dueDate}: ${d.title} [${d.priority}]`).join("; ") || "none"}.`,
  });
  return { ...plan, days: plan.days.filter((d) => d.date >= today && d.date <= input.endDate) };
}
