import { Schema, model, type InferSchemaType, Types } from "mongoose";
import { baseOptions } from "./common.js";

export const TASK_CATEGORIES = ["university", "german", "job", "admin", "personal", "other"] as const;
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const TASK_STATUSES = ["todo", "in_progress", "done", "cancelled"] as const;

const taskSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 5000 },
    category: { type: String, enum: TASK_CATEGORIES, default: "personal" },
    priority: { type: String, enum: TASK_PRIORITIES, default: "medium" },
    status: { type: String, enum: TASK_STATUSES, default: "todo" },
    dueDate: { type: String, default: null }, // YYYY-MM-DD in user's timezone
    dueTime: { type: String, default: null }, // HH:mm
    reminderAt: { type: Date, default: null },
    reminderSentAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    source: { type: String, enum: ["manual", "assistant", "quick_add", "document", "study_plan"], default: "manual" },
    documentId: { type: Schema.Types.ObjectId, ref: "Document", default: null },
    applicationId: { type: Schema.Types.ObjectId, ref: "Application", default: null },
  },
  baseOptions,
);

taskSchema.index({ userId: 1, status: 1, dueDate: 1 });
taskSchema.index({ reminderAt: 1, reminderSentAt: 1 });
taskSchema.index({ title: "text", description: "text" });

export type TaskDoc = InferSchemaType<typeof taskSchema> & { _id: Types.ObjectId };
export const Task = model("Task", taskSchema);
