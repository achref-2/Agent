import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { HttpError, unauthorized } from "../lib/errors.js";
import { parse } from "../lib/validate.js";
import { clearSession, currentUser, issueSession, requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.NODE_ENV === "test" ? 1000 : 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Too many attempts. Try again in 15 minutes." } },
});

const Credentials = z.object({
  email: z.email().max(200),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});

authRouter.get("/status", async (_req, res) => {
  const users = await User.estimatedDocumentCount();
  res.json({ registrationOpen: users === 0 || config.ALLOW_REGISTRATION, hasUsers: users > 0 });
});

authRouter.post("/register", authLimiter, async (req, res) => {
  const input = parse(Credentials.extend({ name: z.string().trim().min(1).max(80) }), req.body);
  const users = await User.estimatedDocumentCount();
  if (users > 0 && !config.ALLOW_REGISTRATION) throw new HttpError(403, "Registration is closed. Set ALLOW_REGISTRATION=true to add users.", "registration_closed");
  if (await User.exists({ email: input.email.toLowerCase() })) throw new HttpError(409, "An account with this email already exists.", "conflict");
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.create({ email: input.email, name: input.name, passwordHash });
  issueSession(res, String(user._id));
  res.status(201).json({ user });
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const input = parse(Credentials.extend({ password: z.string().min(1).max(200) }), req.body);
  const user = await User.findOne({ email: input.email.toLowerCase() }).select("+passwordHash");
  // Compare even when the user does not exist, so response time does not reveal valid emails.
  const ok = await bcrypt.compare(input.password, user?.passwordHash ?? "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
  if (!user || !ok) throw unauthorized("Wrong email or password.");
  issueSession(res, String(user._id));
  res.json({ user: user.toJSON() });
});

authRouter.post("/logout", (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: currentUser(req) });
});

authRouter.post("/change-password", requireAuth, authLimiter, async (req, res) => {
  const input = parse(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10).max(200) }), req.body);
  const user = await User.findById(currentUser(req)._id).select("+passwordHash");
  if (!user || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) throw unauthorized("Current password is wrong.");
  user.passwordHash = await bcrypt.hash(input.newPassword, 12);
  await user.save();
  res.json({ ok: true });
});
