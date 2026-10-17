import { Schema, model, type InferSchemaType, Types } from "mongoose";
import { baseOptions } from "./common.js";

// In-app notifications created by the reminder scheduler.
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["reminder", "follow_up"], default: "reminder" },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    taskId: { type: Schema.Types.ObjectId, default: null },
    // Unique key prevents duplicate notifications for the same reminder occurrence.
    dedupeKey: { type: String, required: true },
    readAt: { type: Date, default: null },
  },
  baseOptions,
);
notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });
export const Notification = model("Notification", notificationSchema);

// Destructive actions proposed by the agent wait here until the user confirms them.
const pendingActionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tool: { type: String, required: true },
    input: { type: Schema.Types.Mixed, required: true },
    summary: { type: String, required: true },
    status: { type: String, enum: ["pending", "confirmed", "rejected", "expired", "failed"], default: "pending" },
    result: { type: Schema.Types.Mixed, default: null },
    expiresAt: { type: Date, required: true },
  },
  baseOptions,
);
export type PendingActionDoc = InferSchemaType<typeof pendingActionSchema> & { _id: Types.ObjectId };
export const PendingAction = model("PendingAction", pendingActionSchema);

const germanMistakeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    category: { type: String, required: true, maxlength: 80 }, // e.g. "Dativ after mit"
    example: { type: String, default: "", maxlength: 500 },
    correction: { type: String, default: "", maxlength: 500 },
    explanation: { type: String, default: "", maxlength: 1500 },
    count: { type: Number, default: 1 },
    lastSeenAt: { type: Date, default: () => new Date() },
  },
  baseOptions,
);
germanMistakeSchema.index({ userId: 1, category: 1 }, { unique: true });
export const GermanMistake = model("GermanMistake", germanMistakeSchema);

const studyTopicSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, maxlength: 160 },
    course: { type: String, default: "", maxlength: 120 },
    attempts: { type: Number, default: 0 },
    correct: { type: Number, default: 0 },
    struggling: { type: Boolean, default: false },
    notes: { type: String, default: "", maxlength: 2000 },
  },
  baseOptions,
);
studyTopicSchema.index({ userId: 1, name: 1 }, { unique: true });
export const StudyTopic = model("StudyTopic", studyTopicSchema);

const briefingSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: String, required: true },
    content: { type: String, required: true },
    model: { type: String, default: "" },
  },
  baseOptions,
);
briefingSchema.index({ userId: 1, date: 1 }, { unique: true });
export const Briefing = model("Briefing", briefingSchema);
