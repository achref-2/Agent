import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aiStatus, config } from "./config.js";
import { logger } from "./lib/logger.js";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { cors, requireAppHeader } from "./middleware/security.js";
import { applicationsRouter } from "./routes/applications.js";
import { aiLimiter, assistantRouter } from "./routes/assistant.js";
import { authRouter } from "./routes/auth.js";
import { documentsRouter } from "./routes/documents.js";
import { eventsRouter } from "./routes/events.js";
import { germanRouter } from "./routes/german.js";
import { dashboardRouter, memoryRouter, notificationsRouter, settingsRouter } from "./routes/misc.js";
import { studyRouter } from "./routes/study.js";
import { tasksRouter } from "./routes/tasks.js";
import { AiError } from "./ai/provider.js";
import type { NextFunction, Request, Response } from "express";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors(config.CLIENT_ORIGIN.split(",").map((s) => s.trim())));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  // Request log: method, path, status and duration only. No bodies, no query strings.
  app.use((req, res, next) => {
    const started = Date.now();
    res.on("finish", () => {
      if (req.path.startsWith("/api")) logger.info("request", { method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - started });
    });
    next();
  });

  app.use("/api", requireAppHeader);
  app.get("/api/health", (_req, res) => res.json({ ok: true, ai: aiStatus() }));
  app.use("/api/auth", authRouter);

  const api = express.Router();
  api.use(requireAuth);
  api.use(["/study", "/german/sessions/:id/messages", "/german/check", "/german/draft", "/german/exercises", "/applications/parse", "/applications/:id/analyze", "/applications/:id/drafts", "/documents/:id/analyze", "/dashboard/briefing"], (req, res, next) =>
    req.method === "POST" ? aiLimiter(req, res, next) : next(),
  );
  api.use("/tasks", tasksRouter);
  api.use("/events", eventsRouter);
  api.use("/applications", applicationsRouter);
  api.use("/documents", documentsRouter);
  api.use("/study", studyRouter);
  api.use("/german", germanRouter);
  api.use("/assistant", assistantRouter);
  api.use("/dashboard", dashboardRouter);
  api.use("/notifications", notificationsRouter);
  api.use("/memory", memoryRouter);
  api.use("/settings", settingsRouter);
  app.use("/api", api);

  // AI provider failures become clear, honest error messages.
  app.use("/api", (err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (!(err instanceof AiError)) return next(err);
    const status = err.kind === "rate_limit" ? 429 : err.kind === "refusal" ? 422 : err.kind === "bad_request" ? 400 : 502;
    res.status(status).json({ error: { code: `ai_${err.kind}`, message: err.message } });
  });
  app.use("/api", notFoundHandler);

  // In production the server also serves the built React app.
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
  if (config.NODE_ENV === "production" && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  }

  app.use(errorHandler);
  return app;
}
