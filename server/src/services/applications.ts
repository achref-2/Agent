import { Types } from "mongoose";
import { z } from "zod";
import { notFound } from "../lib/errors.js";
import { escapeRegex, isoDate } from "../lib/validate.js";
import { Application, APPLICATION_STATUSES, EMPLOYMENT_TYPES } from "../models/Application.js";
import type { UserDoc } from "../models/User.js";

export const ApplicationFieldsSchema = z.object({
  company: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  url: z.union([z.url().max(2000), z.literal("")]).optional(),
  location: z.string().max(200).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  status: z.enum(APPLICATION_STATUSES).optional(),
  appliedDate: isoDate.nullable().optional(),
  followUpDate: isoDate.nullable().optional(),
  contact: z
    .object({
      name: z.string().max(200).optional(),
      email: z.string().max(200).optional(),
      phone: z.string().max(60).optional(),
    })
    .optional(),
  notes: z.string().max(10000).optional(),
  description: z.string().max(30000).optional(),
});
export const ApplicationCreateSchema = ApplicationFieldsSchema;
export const ApplicationUpdateSchema = ApplicationFieldsSchema.partial();

export const ApplicationSearchSchema = z.object({
  status: z.enum(APPLICATION_STATUSES).optional(),
  search: z.string().max(200).optional(),
  followUpDue: z.coerce.boolean().optional().describe("Only applications whose follow-up date is today or earlier"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function createApplication(user: UserDoc, input: z.infer<typeof ApplicationCreateSchema>) {
  return Application.create({ ...input, userId: user._id });
}

export async function getApplication(user: UserDoc, id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound("Application");
  const app = await Application.findOne({ _id: id, userId: user._id });
  if (!app) throw notFound("Application");
  return app;
}

export async function updateApplication(user: UserDoc, id: string, input: z.infer<typeof ApplicationUpdateSchema>, today?: string) {
  const app = await getApplication(user, id);
  const patch: Record<string, unknown> = { ...input };
  // Moving to "applied" without a date records today as the application date.
  if (input.status === "applied" && !app.appliedDate && input.appliedDate === undefined && today) patch.appliedDate = today;
  app.set(patch);
  await app.save();
  return app;
}

export async function deleteApplication(user: UserDoc, id: string) {
  const app = await getApplication(user, id);
  await app.deleteOne();
  return { id, company: app.company, title: app.title };
}

export async function searchApplications(user: UserDoc, raw: z.input<typeof ApplicationSearchSchema>, today?: string) {
  const input = ApplicationSearchSchema.parse(raw);
  const q: Record<string, unknown> = { userId: user._id };
  if (input.status) q.status = input.status;
  if (input.search) {
    const rx = new RegExp(escapeRegex(input.search), "i");
    q.$or = [{ company: rx }, { title: rx }, { location: rx }, { notes: rx }];
  }
  if (input.followUpDue && today) q.followUpDate = { $ne: null, $lte: today };
  return Application.find(q).sort({ updatedAt: -1 }).limit(input.limit).select("-description -drafts");
}
