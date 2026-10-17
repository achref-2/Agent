import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { z } from "zod";
import { resolvePendingAction, runAgent } from "../ai/agent.js";
import { config } from "../config.js";
import { notFound } from "../lib/errors.js";
import { objectId, parse } from "../lib/validate.js";
import { currentUser } from "../middleware/auth.js";
import { Conversation } from "../models/Conversation.js";

export const assistantRouter = Router();

// AI calls cost money: cap them per user.
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.NODE_ENV === "test" ? 1000 : 20,
  keyGenerator: (req) => (req.user ? String(req.user._id) : ipKeyGenerator(req.ip ?? "")),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Too many AI requests. Wait a minute and try again." } },
});

assistantRouter.get("/conversations", async (req, res) => {
  const conversations = await Conversation.find({ userId: currentUser(req)._id, mode: "assistant" }).sort({ updatedAt: -1 }).limit(50).select("title updatedAt createdAt");
  res.json({ conversations });
});

assistantRouter.get("/conversations/:id", async (req, res) => {
  const conversation = await Conversation.findOne({ _id: parse(objectId, req.params.id), userId: currentUser(req)._id, mode: "assistant" });
  if (!conversation) throw notFound("Conversation");
  res.json({ conversation });
});

assistantRouter.delete("/conversations/:id", async (req, res) => {
  await Conversation.deleteOne({ _id: parse(objectId, req.params.id), userId: currentUser(req)._id, mode: "assistant" });
  res.json({ ok: true });
});

assistantRouter.post("/chat", aiLimiter, async (req, res) => {
  const user = currentUser(req);
  const input = parse(z.object({ message: z.string().trim().min(1).max(4000), conversationId: objectId.optional() }), req.body);
  let conversation = input.conversationId
    ? await Conversation.findOne({ _id: input.conversationId, userId: user._id, mode: "assistant" })
    : await Conversation.create({ userId: user._id, mode: "assistant", title: input.message.slice(0, 60) });
  if (!conversation) throw notFound("Conversation");

  const history = conversation.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  const result = await runAgent(user, history, input.message);
  conversation.messages.push({ role: "user", content: input.message });
  conversation.messages.push({ role: "assistant", content: result.reply, toolActivity: result.toolActivity, meta: { model: result.model, stopped: result.stopped } });
  await conversation.save();
  res.json({ conversationId: String(conversation._id), reply: result.reply, toolActivity: result.toolActivity, model: result.model, stopped: result.stopped });
});

assistantRouter.post("/actions/:id", async (req, res) => {
  const { approve } = parse(z.object({ approve: z.boolean() }), req.body);
  res.json(await resolvePendingAction(currentUser(req), parse(objectId, req.params.id), approve));
});
