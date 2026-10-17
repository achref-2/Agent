import type { NextFunction, Request, Response } from "express";
import { forbidden } from "../lib/errors.js";

// CSRF protection: the session cookie is SameSite=strict, and every state-changing API request
// must carry a custom header. Browsers refuse to send custom headers cross-origin without a CORS
// preflight, which this server never approves for foreign origins.
export function requireAppHeader(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("x-ghostmate") !== "1") return next(forbidden("Missing X-GhostMate header"));
  next();
}

export function cors(allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.get("origin");
    if (origin && allowed.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-GhostMate");
        return res.sendStatus(204);
      }
    }
    next();
  };
}
