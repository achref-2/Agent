import { z } from "zod";
import { getProvider } from "../ai/index.js";
import { GermanMistake } from "../models/misc.js";
import type { UserDoc } from "../models/User.js";
import { EXPLANATION_LANGUAGES } from "./ai-common.js";

export const SCENARIOS: Record<string, string> = {
  landlord: "a landlord (Vermieter) in Köln: viewing a flat, asking about Nebenkosten, Kaution, Anmeldung or reporting a problem",
  employer: "an interviewer at a company hiring a Werkstudent (working student) in software development",
  university: "a staff member at the TH Köln Studierendensekretariat or International Office",
  auslaenderbehoerde: "an official at the Ausländerbehörde about a residence permit appointment",
  doctor: "a receptionist at a Hausarztpraxis booking an appointment",
  smalltalk: "a friendly classmate making small talk in the Mensa",
  shopping: "a shop assistant or a phone-contract salesperson",
  free: "a friendly conversation partner; the user picks the topic",
};

function explanationLanguage(user: UserDoc) {
  return EXPLANATION_LANGUAGES[user.german?.explanationLanguage ?? "en"] ?? "English";
}

const CorrectionSchema = z.object({
  original: z.string().describe("The user's wording"),
  corrected: z.string().describe("Correct German"),
  explanation: z.string().describe("Short explanation in the explanation language"),
  category: z.string().describe("Short reusable grammar label, e.g. 'Dativ nach mit', 'Verbposition im Nebensatz', 'Artikel: das Problem'"),
});

const TurnSchema = z.object({
  reply: z.string().describe("Your in-character reply in natural German"),
  replyTranslation: z.string().describe("Translation of your reply into the explanation language"),
  corrections: z.array(CorrectionSchema).describe("Real mistakes in the user's last message only; empty if none"),
  naturalAlternative: z.string().nullable().describe("A more natural/idiomatic way a native speaker would say the user's message, or null"),
  tip: z.string().nullable().describe("One short vocabulary or culture tip, or null"),
});

export type GermanTurn = z.infer<typeof TurnSchema>;

export async function germanTurn(
  user: UserDoc,
  input: { scenario: string; history: { role: "user" | "assistant"; content: string }[]; text: string },
): Promise<GermanTurn> {
  const level = user.german?.level ?? "B1";
  const lang = explanationLanguage(user);
  const transcript = input.history
    .slice(-16)
    .map((m) => `${m.role === "user" ? "Learner" : "You"}: ${m.content}`)
    .join("\n");
  const turn = await getProvider().generateObject({
    system: `You are a German conversation coach. Role-play as ${SCENARIOS[input.scenario] ?? SCENARIOS.free}. Speak natural, idiomatic everyday German as used in Germany (not textbook German), adapted to CEFR level ${level}: at A1-A2 use short, simple sentences; at C1-C2 speak normally. Learner goals: ${user.german?.goals || "not specified"}. Write all explanations and translations in ${lang}. Correct only genuine mistakes; do not invent errors. If the learner writes in English or another language, gently answer in German and show how to say it in German.`,
    schema: TurnSchema,
    prompt: `${transcript ? `Conversation so far:\n${transcript}\n\n` : ""}Learner's new message: ${input.text}`,
  });
  await recordMistakes(user, turn.corrections);
  return turn;
}

export async function recordMistakes(user: UserDoc, corrections: z.infer<typeof CorrectionSchema>[]) {
  for (const c of corrections) {
    const category = c.category.trim().slice(0, 80);
    if (!category) continue;
    await GermanMistake.findOneAndUpdate(
      { userId: user._id, category },
      { $inc: { count: 1 }, $set: { example: c.original.slice(0, 500), correction: c.corrected.slice(0, 500), explanation: c.explanation.slice(0, 1500), lastSeenAt: new Date() } },
      { upsert: true },
    );
  }
}

const CheckSchema = z.object({
  corrected: z.string(),
  corrections: z.array(CorrectionSchema),
  naturalVersion: z.string().describe("How a native speaker would naturally write it"),
  overall: z.string().describe("One or two sentences of feedback in the explanation language"),
});

export async function checkText(user: UserDoc, text: string) {
  const out = await getProvider().generateObject({
    system: `You are a precise German teacher. The learner is CEFR ${user.german?.level ?? "B1"}. Explain in ${explanationLanguage(user)}. Correct only genuine mistakes.`,
    schema: CheckSchema,
    prompt: `Check this German text:\n\n${text}`,
  });
  await recordMistakes(user, out.corrections);
  return out;
}

const ExercisesSchema = z.object({
  exercises: z.array(
    z.object({
      category: z.string(),
      instruction: z.string().describe("In the explanation language"),
      prompt: z.string().describe("The German exercise sentence or task, with ___ for gaps"),
      answer: z.string(),
      explanation: z.string(),
    }),
  ),
});

export async function generateExercises(user: UserDoc, count = 8) {
  const mistakes = await GermanMistake.find({ userId: user._id }).sort({ count: -1, lastSeenAt: -1 }).limit(8);
  const focus = mistakes.length
    ? mistakes.map((m) => `- ${m.category} (seen ${m.count}x), e.g. "${m.example}" -> "${m.correction}"`).join("\n")
    : "No recorded mistakes yet: choose typical problem areas for this level (cases, verb position, articles, prepositions).";
  return getProvider().generateObject({
    system: `You are a German teacher creating short personalised exercises for a CEFR ${user.german?.level ?? "B1"} learner. Explanations in ${explanationLanguage(user)}.`,
    schema: ExercisesSchema,
    prompt: `Create ${count} varied exercises (gap fill, reorder, transform, translate) targeting these recurring mistakes:\n${focus}`,
  });
}

const DraftSchema = z.object({
  subject: z.string().nullable(),
  german: z.string().describe("The complete German text, ready to send"),
  gloss: z.string().describe("Translation into the explanation language"),
  notes: z.array(z.string()).describe("Short notes on tone, phrases used, and anything the user must fill in"),
});

export async function draftText(
  user: UserDoc,
  input: { kind: "email" | "message" | "letter"; recipient: string; situation: string; formality: "formal" | "informal"; points?: string },
) {
  return getProvider().generateObject({
    system: `You write correct, natural German ${input.kind}s for a student living in Köln. Use the standard conventions of German correspondence (Sehr geehrte/r ..., Mit freundlichen Grüßen for formal; Hallo/Liebe/r ..., Viele Grüße for informal). Never invent facts such as dates, reference numbers or personal details: use placeholders like [Datum] or [Aktenzeichen]. Explanations in ${explanationLanguage(user)}.`,
    schema: DraftSchema,
    prompt: `Write a ${input.formality} ${input.kind} to ${input.recipient}.\nSituation: ${input.situation}\n${input.points ? `Points to include: ${input.points}\n` : ""}Sender name: ${user.name}`,
  });
}
