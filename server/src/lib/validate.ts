import { Types } from "mongoose";
import { z } from "zod";
import { badRequest } from "./errors.js";

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(
      "Invalid input",
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return result.data;
}

export const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), "Invalid id");
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm (24h)");

export function assertId(id: string, what = "Resource") {
  if (!Types.ObjectId.isValid(id)) throw badRequest(`Invalid ${what.toLowerCase()} id`);
  return id;
}

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
