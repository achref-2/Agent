import { Types } from "mongoose";
import { z } from "zod";
import { addDays, todayInTz, zonedToUtc } from "../lib/dates.js";
import { badRequest, notFound } from "../lib/errors.js";
import { escapeRegex, hhmm, isoDate, objectId } from "../lib/validate.js";
import { Task, TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUSES, type TaskDoc } from "../models/Task.js";
import type { UserDoc } from "../models/User.js";

export const TaskFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  category: z.enum(TASK_CATEGORIES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  dueDate: isoDate.nullable().optional(),
  dueTime: hhmm.nullable().optional(),
  reminderDate: isoDate.nullable().optional().describe("Local date of the in-app reminder"),
  reminderTime: hhmm.nullable().optional().describe("Local time of the in-app reminder, default 09:00"),
  documentId: objectId.nullable().optional(),
  applicationId: objectId.nullable().optional(),
});
export const TaskCreateSchema = TaskFieldsSchema;
export const TaskUpdateSchema = TaskFieldsSchema.partial();
export type TaskCreateInput = z.infer<typeof TaskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof TaskUpdateSchema>;

export const TaskListSchema = z.object({
  status: z.enum(["open", "all", ...TASK_STATUSES]).default("open"),
  category: z.enum(TASK_CATEGORIES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueFrom: isoDate.optional(),
  dueTo: isoDate.optional(),
  overdue: z.coerce.boolean().optional(),
  search: z.string().max(200).optional(),
  sort: z.enum(["urgency", "due", "created", "updated"]).default("urgency"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type TaskListInput = z.input<typeof TaskListSchema>;

type Source = "manual" | "assistant" | "quick_add" | "document" | "study_plan";

function reminderFields(input: TaskUpdateInput, user: UserDoc, existing?: TaskDoc) {
  if (input.reminderDate === undefined && input.reminderTime === undefined) return {};
  if (input.reminderDate === null) return { reminderAt: null, reminderSentAt: null };
  const date = input.reminderDate ?? existing?.dueDate ?? null;
  if (!date) throw badRequest("A reminder needs a reminderDate (or a task due date)");
  const time = input.reminderTime ?? "09:00";
  return { reminderAt: zonedToUtc(date, time, user.timezone), reminderSentAt: null };
}

function toFields(input: TaskUpdateInput) {
  const { reminderDate: _a, reminderTime: _b, ...rest } = input;
  return rest;
}

export async function createTask(user: UserDoc, input: TaskCreateInput, source: Source = "manual") {
  const task = await Task.create({
    ...toFields(input),
    ...reminderFields(input, user),
    userId: user._id,
    source,
    completedAt: input.status === "done" ? new Date() : null,
  });
  return task;
}

export async function getTask(user: UserDoc, id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound("Task");
  const task = await Task.findOne({ _id: id, userId: user._id });
  if (!task) throw notFound("Task");
  return task;
}

export async function updateTask(user: UserDoc, id: string, input: TaskUpdateInput) {
  const task = await getTask(user, id);
  const patch: Record<string, unknown> = { ...toFields(input), ...reminderFields(input, user, task as unknown as TaskDoc) };
  if (input.status && input.status !== task.status) patch.completedAt = input.status === "done" ? new Date() : null;
  task.set(patch);
  await task.save();
  return task;
}

export async function completeTask(user: UserDoc, id: string) {
  return updateTask(user, id, { status: "done" });
}

export async function deleteTask(user: UserDoc, id: string) {
  const task = await getTask(user, id);
  await task.deleteOne();
  return { id, title: task.title };
}

const PRIORITY_WEIGHT: Record<string, number> = { urgent: 40, high: 25, medium: 10, low: 0 };

export function urgencyScore(t: { dueDate?: string | null; priority: string; status: string }, today: string) {
  let s = PRIORITY_WEIGHT[t.priority] ?? 0;
  if (t.dueDate) {
    if (t.dueDate < today) s += 100;
    else if (t.dueDate === today) s += 60;
    else if (t.dueDate <= addDays(today, 3)) s += 40;
    else if (t.dueDate <= addDays(today, 7)) s += 20;
  }
  if (t.status === "in_progress") s += 5;
  return s;
}

export async function listTasks(user: UserDoc, rawInput: TaskListInput = {}) {
  const input = TaskListSchema.parse(rawInput);
  const today = todayInTz(user.timezone);
  const q: Record<string, unknown> = { userId: user._id };
  if (input.status === "open") q.status = { $in: ["todo", "in_progress"] };
  else if (input.status !== "all") q.status = input.status;
  if (input.category) q.category = input.category;
  if (input.priority) q.priority = input.priority;
  const due: Record<string, string> = {};
  if (input.dueFrom) due.$gte = input.dueFrom;
  if (input.dueTo) due.$lte = input.dueTo;
  if (input.overdue) {
    due.$lt = today;
    q.status = { $in: ["todo", "in_progress"] };
  }
  if (Object.keys(due).length) q.dueDate = { ...due, $ne: null };
  if (input.search) {
    const rx = new RegExp(escapeRegex(input.search), "i");
    q.$or = [{ title: rx }, { description: rx }];
  }
  const sortSpec: Record<string, 1 | -1> =
    input.sort === "created" ? { createdAt: -1 } : input.sort === "updated" ? { updatedAt: -1 } : { dueDate: 1, dueTime: 1 };
  let tasks = await Task.find(q).sort(sortSpec).limit(input.sort === "urgency" ? 500 : input.limit);
  if (input.sort === "urgency") {
    tasks = tasks
      .map((t) => ({ t, s: urgencyScore(t, today) }))
      .sort((a, b) => b.s - a.s || (a.t.dueDate ?? "9999").localeCompare(b.t.dueDate ?? "9999"))
      .slice(0, input.limit)
      .map((x) => x.t);
  } else if (input.sort === "due") {
    // Undated tasks last.
    tasks = [...tasks.filter((t) => t.dueDate), ...tasks.filter((t) => !t.dueDate)];
  }
  return tasks;
}
