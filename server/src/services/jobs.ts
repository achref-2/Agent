import { z } from "zod";
import { getProvider } from "../ai/index.js";
import { badRequest } from "../lib/errors.js";
import { EMPLOYMENT_TYPES } from "../models/Application.js";
import type { UserDoc } from "../models/User.js";
import { UNTRUSTED_RULE, wrapUntrusted } from "./ai-common.js";
import { getApplication } from "./applications.js";

const JOB_SYSTEM = `You help a Master's student in Informatik at TH Köln with student-job applications in Köln and nearby. Be honest: never invent experience, skills, qualifications, listings or outcomes. ${UNTRUSTED_RULE}`;

const ParsedJobSchema = z.object({
  company: z.string().nullable(),
  title: z.string().nullable(),
  location: z.string().nullable(),
  employmentType: z.enum(EMPLOYMENT_TYPES).nullable(),
  summary: z.string().describe("2-4 sentence summary of the role in English"),
  mustHave: z.array(z.string()),
  niceToHave: z.array(z.string()),
  languages: z.array(z.string()).describe("Language requirements, e.g. 'German C1'"),
  applicationDeadline: z.string().nullable().describe("YYYY-MM-DD if stated, otherwise null"),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
});

export async function parseJobPosting(text: string) {
  return getProvider().generateObject({
    system: JOB_SYSTEM,
    schema: ParsedJobSchema,
    prompt: `Extract the details of this job posting. Use null for anything not stated; do not guess.\n\n${wrapUntrusted(text)}`,
  });
}

function profileText(user: UserDoc) {
  const p = user.profile;
  const parts = [
    p?.headline && `Headline: ${p.headline}`,
    p?.background && `Background and experience: ${p.background}`,
    p?.skills?.length && `Skills: ${p.skills.join(", ")}`,
    p?.languages && `Languages: ${p.languages}`,
    p?.location && `Location: ${p.location}`,
  ].filter(Boolean);
  return parts.join("\n");
}

const FitSchema = z.object({
  overallFit: z.enum(["strong", "moderate", "weak", "unclear"]),
  matches: z.array(z.object({ requirement: z.string(), evidence: z.string().describe("What in the profile supports it") })),
  gaps: z.array(z.object({ requirement: z.string(), suggestion: z.string().describe("Honest way to address or learn it") })),
  unclear: z.array(z.string()).describe("Requirements the profile does not say anything about"),
  priorityAdvice: z.string(),
  talkingPoints: z.array(z.string()),
});

export async function analyzeFit(user: UserDoc, applicationId: string) {
  const app = await getApplication(user, applicationId);
  const profile = profileText(user);
  if (!user.profile?.background?.trim() && !user.profile?.skills?.length) throw badRequest("Add your background and skills under Memory & Settings > Profile first, so the comparison is based on real information.");
  if (!app.description && !app.requirements?.mustHave?.length) throw badRequest("Paste the job description into this application first.");
  const fit = await getProvider().generateObject({
    system: JOB_SYSTEM,
    schema: FitSchema,
    prompt: `Compare the candidate profile with the job. Only count a requirement as matched if the profile clearly supports it; list missing ones honestly as gaps, and unknown ones as unclear.\n\nCANDIDATE PROFILE (written by the user):\n${profile}\n\nJOB: ${app.title} at ${app.company} (${app.location})\nRequirements: ${JSON.stringify(app.requirements)}\n${wrapUntrusted(app.description ?? "")}`,
  });
  app.fitAnalysis = { ...fit, generatedAt: new Date().toISOString() };
  await app.save();
  return fit;
}

export const DRAFT_KINDS = ["cover_letter", "follow_up", "interview_prep", "message"] as const;

export async function draftForApplication(user: UserDoc, applicationId: string, input: { kind: (typeof DRAFT_KINDS)[number]; language: "de" | "en"; instructions?: string }) {
  const app = await getApplication(user, applicationId);
  const profile = profileText(user) || "(The user has not filled in a profile. Use placeholders such as [relevant experience].)";
  const lang = input.language === "de" ? "German" : "English";
  const task = {
    cover_letter: `Write a tailored ${lang} cover letter (Anschreiben) for this application, about 250-350 words, following German conventions (Betreff line, Sehr geehrte/r ..., Mit freundlichen Grüßen). Base every claim about the candidate on the profile; use [placeholders] where information is missing.`,
    follow_up: `Write a short, polite ${lang} follow-up email asking about the status of the application${app.appliedDate ? ` submitted on ${app.appliedDate}` : ""}.`,
    interview_prep: `Prepare for an interview in ${lang}: 8 likely questions (technical and behavioural, including typical German Werkstudent questions about availability and hours), for each a suggested answer outline based only on the profile, plus 4 good questions to ask the employer. Use Markdown.`,
    message: `Write a short ${lang} message to the contact person about this application.`,
  }[input.kind];
  const content = await getProvider().generateText({
    system: JOB_SYSTEM,
    prompt: `${task}\n${input.instructions ? `Extra instructions from the user: ${input.instructions}\n` : ""}\nCANDIDATE: ${user.name}\n${profile}\n\nJOB: ${app.title} at ${app.company}, ${app.location}\nContact: ${app.contact?.name || "unknown"}\nRequirements: ${JSON.stringify(app.requirements)}\n${wrapUntrusted(app.description || "(no description saved)")}`,
  });
  app.drafts.push({ kind: input.kind, language: input.language, content });
  await app.save();
  return app.drafts[app.drafts.length - 1];
}
