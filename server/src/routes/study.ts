import { Router } from "express";
import { z } from "zod";
import { isoDate, objectId, parse } from "../lib/validate.js";
import { currentUser } from "../middleware/auth.js";
import { StudyTopic } from "../models/misc.js";
import { askDocuments, explainConcept, generateMaterial, recordTopicResult, revisionPlan, summarizeDocument } from "../services/study.js";

export const studyRouter = Router();
const level = z.enum(["beginner", "advanced"]).default("beginner");

studyRouter.post("/ask", async (req, res) => {
  const input = parse(z.object({ question: z.string().trim().min(3).max(2000), documentIds: z.array(objectId).max(20).optional(), level }), req.body);
  res.json(await askDocuments(currentUser(req), input));
});

studyRouter.post("/summarize", async (req, res) => {
  const input = parse(z.object({ documentId: objectId, level }), req.body);
  res.json(await summarizeDocument(currentUser(req), input.documentId, input.level));
});

studyRouter.post("/explain", async (req, res) => {
  const input = parse(z.object({ concept: z.string().trim().min(2).max(500), level, documentIds: z.array(objectId).max(20).optional() }), req.body);
  res.json(await explainConcept(currentUser(req), input));
});

studyRouter.post("/material", async (req, res) => {
  const input = parse(
    z.object({ documentId: objectId, type: z.enum(["quiz", "flashcards", "exercises"]), count: z.number().int().min(1).max(20).default(5), topic: z.string().max(200).optional(), level }),
    req.body,
  );
  res.json(await generateMaterial(currentUser(req), input));
});

studyRouter.post("/topics/result", async (req, res) => {
  const input = parse(z.object({ topic: z.string().trim().min(1).max(160), course: z.string().max(120).optional(), correct: z.boolean() }), req.body);
  res.json({ topic: await recordTopicResult(currentUser(req), input) });
});

studyRouter.get("/topics", async (req, res) => {
  res.json({ topics: await StudyTopic.find({ userId: currentUser(req)._id }).sort({ struggling: -1, updatedAt: -1 }).limit(200) });
});

studyRouter.delete("/topics/:id", async (req, res) => {
  await StudyTopic.deleteOne({ _id: parse(objectId, req.params.id), userId: currentUser(req)._id });
  res.json({ ok: true });
});

studyRouter.post("/plan", async (req, res) => {
  const input = parse(
    z.object({ goal: z.string().trim().min(3).max(500), endDate: isoDate, minutesPerDay: z.number().int().min(15).max(720), topics: z.array(z.string().max(160)).max(30).optional() }),
    req.body,
  );
  res.json(await revisionPlan(currentUser(req), input));
});
