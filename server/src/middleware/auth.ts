import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { unauthorized } from "../lib/errors.js";
import { User, type UserDoc } from "../models/User.js";

export const SESSION_COOKIE = "gm_session";
const SESSION_DAYS = 7;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserDoc;
    }
  }
}

export function issueSession(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, config.JWT_SECRET, { expiresIn: `${SESSION_DAYS}d`, algorithm: "HS256" });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: config.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 3600 * 1000,
    path: "/",
  });
}

export function clearSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next(unauthorized());
  let sub: string;
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof payload === "string" || typeof payload.sub !== "string") throw new Error("bad token");
    sub = payload.sub;
  } catch {
    return next(unauthorized("Session expired. Please sign in again."));
  }
  const user = await User.findById(sub);
  if (!user) return next(unauthorized());
  req.user = user as unknown as UserDoc;
  next();
}

/** The authenticated user. Only call inside routes protected by requireAuth. */
export function currentUser(req: Request): UserDoc {
  if (!req.user) throw unauthorized();
  return req.user;
}
