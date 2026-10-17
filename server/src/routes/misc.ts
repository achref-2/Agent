import { Router } from "express";
import { z } from "zod";
import { aiStatus } from "../config.js";
import { notFound } from "../lib/errors.js";
import { isValidTimeZone } from "../lib/dates.js";
import { objectId, parse } from "../lib/validate.js";
import { currentUser } from "../middleware/auth.js";
import { Application } from "../models/Application.js";
import { Conversation } from "../models/Conversation.js";
import { MEMORY_CATEGORIES, Memory } from "../models/Memory.js";
import { Notification } from "../models/misc.js";
import { Task } from "../models/Task.js";
import { User } from "../models/User.js";
import { CalendarEvent } from "../models/Event.js";
import { DocumentModel } from "../models/Document.js";
import { generateBriefing, getDashboard } from "../services/dashboard.js";
import { integrationStatus } from "../integrations/index.js";

export const dashboardRouter = Router();
dashboardRouter.get("/", async (req, res) => res.json(await getDashboard(currentUser(req))));
dashboardRouter.post("/briefing", async (req, res) => res.json({ briefing: await generateBriefing(currentUser(req)) }));

export const notificationsRouter = Router();
notificationsRouter.get("/", async (req, res) => {
  const { unread } = parse(z.object({ unread: z.enum(["1", "0"]).optional() }), req.query);
  const q: Record<string, unknown> = { userId: currentUser(req)._id };
  if (unread === "1") q.readAt = null;
  res.json({ notifications: await Notification.find(q).sort({ createdAt: -1 }).limit(50) });
});
notificationsRouter.post("/read-all", async (req, res) => {
  await Notification.updateMany({ userId: currentUser(req)._id, readAt: null }, { readAt: new Date() });
  res.json({ ok: true });
});
notificationsRouter.post("/:id/read", async (req, res) => {
  const n = await Notification.findOneAndUpdate({ _id: parse(objectId, req.params.id), userId: currentUser(req)._id }, { readAt: new Date() }, { returnDocument: "after" });
  if (!n) throw notFound("Notification");
  res.json({ notification: n });
});

export const memoryRouter = Router();
const MemoryInput = z.object({ content: z.string().trim().min(3).max(1000), category: z.enum(MEMORY_CATEGORIES).default("other") });
memoryRouter.get("/", async (req, res) => {
  res.json({ memories: await Memory.find({ userId: currentUser(req)._id }).sort({ updatedAt: -1 }).limit(500) });
});
memoryRouter.post("/", async (req, res) => {
  res.status(201).json({ memory: await Memory.create({ ...parse(MemoryInput, req.body), userId: currentUser(req)._id, source: "user" }) });
});
memoryRouter.patch("/:id", async (req, res) => {
  const m = await Memory.findOneAndUpdate({ _id: parse(objectId, req.params.id), userId: currentUser(req)._id }, parse(MemoryInput.partial(), req.body), { returnDocument: "after", runValidators: true });
  if (!m) throw notFound("Memory");
  res.json({ memory: m });
});
memoryRouter.delete("/:id", async (req, res) => {
  const r = await Memory.deleteOne({ _id: parse(objectId, req.params.id), userId: currentUser(req)._id });
  if (!r.deletedCount) throw notFound("Memory");
  res.json({ ok: true });
});
memoryRouter.delete("/", async (req, res) => {
  const r = await Memory.deleteMany({ userId: currentUser(req)._id });
  res.json({ deleted: r.deletedCount });
});

export const settingsRouter = Router();
const SettingsInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    timezone: z.string().refine(isValidTimeZone, "Unknown timezone"),
    memoryEnabled: z.boolean(),
    profile: z
      .object({
        headline: z.string().max(300),
        background: z.string().max(6000),
        skills: z.array(z.string().trim().min(1).max(60)).max(60),
        languages: z.string().max(500),
        location: z.string().max(120),
      })
      .partial(),
    german: z.object({ level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]), goals: z.string().max(1000), explanationLanguage: z.enum(["en", "fr", "tn"]) }).partial(),
  })
  .partial();

settingsRouter.get("/", (req, res) => res.json({ user: currentUser(req), ai: aiStatus(), integrations: integrationStatus() }));
settingsRouter.patch("/", async (req, res) => {
  const input = parse(SettingsInput, req.body);
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (k === "profile" || k === "german") for (const [k2, v2] of Object.entries(v as object)) set[`${k}.${k2}`] = v2;
    else set[k] = v;
  }
  const user = await User.findByIdAndUpdate(currentUser(req)._id, { $set: set }, { returnDocument: "after", runValidators: true });
  res.json({ user });
});

// Export everything GhostMate stores about the user (except passwords and file bytes).
settingsRouter.get("/export", async (req, res) => {
  const userId = currentUser(req)._id;
  const [tasks, events, applications, memories, documents, conversations] = await Promise.all([
    Task.find({ userId }),
    CalendarEvent.find({ userId }),
    Application.find({ userId }),
    Memory.find({ userId }),
    DocumentModel.find({ userId }),
    Conversation.find({ userId }),
  ]);
  res.setHeader("Content-Disposition", 'attachment; filename="ghostmate-export.json"');
  res.json({ exportedAt: new Date().toISOString(), user: currentUser(req), tasks, events, applications, memories, documents, conversations });
});

settingsRouter.delete("/conversations", async (req, res) => {
  const r = await Conversation.deleteMany({ userId: currentUser(req)._id });
  res.json({ deleted: r.deletedCount });
});
