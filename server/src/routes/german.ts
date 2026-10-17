import { Router } from "express";
import { z } from "zod";
import { notFound } from "../lib/errors.js";
import { objectId, parse } from "../lib/validate.js";
import { currentUser } from "../middleware/auth.js";
import { Conversation } from "../models/Conversation.js";
import { GermanMistake } from "../models/misc.js";
import { checkText, draftText, generateExercises, germanTurn, SCENARIOS } from "../services/german.js";

export const germanRouter = Router();

germanRouter.get("/scenarios", (_req, res) => {
  res.json({ scenarios: Object.entries(SCENARIOS).map(([id, description]) => ({ id, description })) });
});

germanRouter.get("/sessions", async (req, res) => {
  const sessions = await Conversation.find({ userId: currentUser(req)._id, mode: "german" }).sort({ updatedAt: -1 }).limit(50).select("title scenario updatedAt createdAt");
  res.json({ sessions });
});

germanRouter.post("/sessions", async (req, res) => {
  const { scenario } = parse(z.object({ scenario: z.enum(Object.keys(SCENARIOS) as [string, ...string[]]) }), req.body);
  const titles: Record<string, string> = { landlord: "Talking to a landlord", employer: "Job interview", university: "University office", auslaenderbehoerde: "Ausländerbehörde", doctor: "Doctor's appointment", smalltalk: "Small talk", shopping: "Shopping & contracts", free: "Free conversation" };
  const session = await Conversation.create({ userId: currentUser(req)._id, mode: "german", scenario, title: titles[scenario] ?? scenario });
  res.status(201).json({ session });
});

germanRouter.get("/sessions/:id", async (req, res) => {
  const session = await Conversation.findOne({ _id: parse(objectId, req.params.id), userId: currentUser(req)._id, mode: "german" });
  if (!session) throw notFound("Session");
  res.json({ session });
});

germanRouter.delete("/sessions/:id", async (req, res) => {
  await Conversation.deleteOne({ _id: parse(objectId, req.params.id), userId: currentUser(req)._id, mode: "german" });
  res.json({ ok: true });
});

germanRouter.post("/sessions/:id/messages", async (req, res) => {
  const user = currentUser(req);
  const { text } = parse(z.object({ text: z.string().trim().min(1).max(2000) }), req.body);
  const session = await Conversation.findOne({ _id: parse(objectId, req.params.id), userId: user._id, mode: "german" });
  if (!session) throw notFound("Session");
  const history = session.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  const turn = await germanTurn(user, { scenario: session.scenario, history, text });
  session.messages.push({ role: "user", content: text, meta: { corrections: turn.corrections, naturalAlternative: turn.naturalAlternative } });
  session.messages.push({ role: "assistant", content: turn.reply, meta: { translation: turn.replyTranslation, tip: turn.tip } });
  await session.save();
  res.json({ turn, session });
});

germanRouter.post("/check", async (req, res) => {
  const { text } = parse(z.object({ text: z.string().trim().min(2).max(5000) }), req.body);
  res.json(await checkText(currentUser(req), text));
});

germanRouter.post("/draft", async (req, res) => {
  const input = parse(
    z.object({
      kind: z.enum(["email", "message", "letter"]),
      recipient: z.string().trim().min(1).max(200),
      situation: z.string().trim().min(5).max(3000),
      formality: z.enum(["formal", "informal"]),
      points: z.string().max(3000).optional(),
    }),
    req.body,
  );
  res.json(await draftText(currentUser(req), input));
});

germanRouter.get("/mistakes", async (req, res) => {
  res.json({ mistakes: await GermanMistake.find({ userId: currentUser(req)._id }).sort({ count: -1, lastSeenAt: -1 }).limit(200) });
});

germanRouter.delete("/mistakes/:id", async (req, res) => {
  await GermanMistake.deleteOne({ _id: parse(objectId, req.params.id), userId: currentUser(req)._id });
  res.json({ ok: true });
});

germanRouter.post("/exercises", async (req, res) => {
  const { count } = parse(z.object({ count: z.number().int().min(3).max(15).default(8) }), req.body ?? {});
  res.json(await generateExercises(currentUser(req), count));
});
