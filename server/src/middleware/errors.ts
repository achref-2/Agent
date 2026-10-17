import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { HttpError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: "not_found", message: `No route for ${req.method} ${req.path}` } });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "File is too large" : err.message;
    return res.status(400).json({ error: { code: "upload_error", message } });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ error: { code: "bad_request", message: err.message } });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: { code: "bad_request", message: `Invalid value for ${err.path}` } });
  }
  const e = err as { type?: string; status?: number };
  if (e?.type === "entity.too.large") {
    return res.status(413).json({ error: { code: "too_large", message: "Request body is too large" } });
  }
  if (e?.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "bad_request", message: "Malformed JSON" } });
  }
  logger.error("Unhandled error", { path: req.path, method: req.method, err: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
  res.status(500).json({ error: { code: "internal", message: "Something went wrong on the server." } });
}
