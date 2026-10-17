import { Schema, model, type InferSchemaType, Types } from "mongoose";
import { baseOptions } from "./common.js";

// A confirmed appointment (lecture, exam, meeting). Distinct from tasks and from AI suggestions.
const eventSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    date: { type: String, required: true }, // YYYY-MM-DD
    startTime: { type: String, default: null },
    endTime: { type: String, default: null },
    location: { type: String, default: "", maxlength: 200 },
    notes: { type: String, default: "", maxlength: 2000 },
    category: { type: String, enum: ["university", "german", "job", "admin", "personal", "other"], default: "university" },
    // Weekly recurrence until a date, e.g. a lecture every Monday this semester.
    repeatWeeklyUntil: { type: String, default: null },
    source: { type: String, enum: ["manual", "assistant"], default: "manual" },
  },
  baseOptions,
);
eventSchema.index({ userId: 1, date: 1 });

export type EventDoc = InferSchemaType<typeof eventSchema> & { _id: Types.ObjectId };
export const CalendarEvent = model("Event", eventSchema);
