import { Router } from "express";
import { z } from "zod";
import { todayInTz } from "../lib/dates.js";
import { parse } from "../lib/validate.js";
import { currentUser } from "../middleware/auth.js";
import {
  ApplicationCreateSchema,
  ApplicationSearchSchema,
  ApplicationUpdateSchema,
  createApplication,
  deleteApplication,
  getApplication,
  searchApplications,
  updateApplication,
} from "../services/applications.js";
import { analyzeFit, draftForApplication, DRAFT_KINDS, parseJobPosting } from "../services/jobs.js";
import { config } from "../config.js";
import { Application } from "../models/Application.js";

export const applicationsRouter = Router();

applicationsRouter.get("/", async (req, res) => {
  const user = currentUser(req);
  res.json({ applications: await searchApplications(user, parse(ApplicationSearchSchema, req.query), todayInTz(user.timezone)) });
});

applicationsRouter.post("/", async (req, res) => {
  res.status(201).json({ application: await createApplication(currentUser(req), parse(ApplicationCreateSchema, req.body)) });
});

// Extract structured fields from a pasted job ad. Nothing is saved until the user confirms the form.
applicationsRouter.post("/parse", async (req, res) => {
  const { text } = parse(z.object({ text: z.string().trim().min(40, "Paste the full job description").max(30000) }), req.body);
  res.json({ parsed: await parseJobPosting(text) });
});

// Live job discovery needs a real, documented job-search API. None is configured in this build.
applicationsRouter.get("/discover/status", (_req, res) => {
  res.json({ available: false, reason: "No job-search provider is configured. Paste job links and descriptions instead." , devMode: config.AI_PROVIDER === "mock" });
});

applicationsRouter.get("/:id", async (req, res) => {
  res.json({ application: await getApplication(currentUser(req), req.params.id) });
});

applicationsRouter.patch("/:id", async (req, res) => {
  const user = currentUser(req);
  const body = parse(
    ApplicationUpdateSchema.extend({
      requirements: z
        .object({ summary: z.string().max(3000), mustHave: z.array(z.string().max(300)).max(40), niceToHave: z.array(z.string().max(300)).max(40), languages: z.array(z.string().max(100)).max(10) })
        .partial()
        .optional(),
    }),
    req.body,
  );
  res.json({ application: await updateApplication(user, req.params.id, body, todayInTz(user.timezone)) });
});

applicationsRouter.delete("/:id", async (req, res) => {
  res.json(await deleteApplication(currentUser(req), req.params.id));
});

applicationsRouter.post("/:id/analyze", async (req, res) => {
  res.json({ fit: await analyzeFit(currentUser(req), req.params.id) });
});

applicationsRouter.post("/:id/drafts", async (req, res) => {
  const input = parse(z.object({ kind: z.enum(DRAFT_KINDS), language: z.enum(["de", "en"]).default("de"), instructions: z.string().max(1000).optional() }), req.body);
  res.status(201).json({ draft: await draftForApplication(currentUser(req), req.params.id, input) });
});

applicationsRouter.delete("/:id/drafts/:draftId", async (req, res) => {
  const app = await getApplication(currentUser(req), req.params.id);
  await Application.updateOne({ _id: app._id }, { $pull: { drafts: { _id: req.params.draftId } } });
  res.json({ ok: true });
});
