import { Schema, model, type InferSchemaType, Types } from "mongoose";
import { baseOptions } from "./common.js";

// Long-term, user-controlled memory (preferences, goals, routines). Operational records such as
// tasks and applications live in their own collections and are the source of truth.
export const MEMORY_CATEGORIES = ["preference", "communication_style", "project", "study_goal", "routine", "other"] as const;

const memorySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    category: { type: String, enum: MEMORY_CATEGORIES, default: "other" },
    content: { type: String, required: true, trim: true, maxlength: 1000 },
    source: { type: String, enum: ["user", "assistant"], default: "user" },
  },
  baseOptions,
);

export type MemoryDoc = InferSchemaType<typeof memorySchema> & { _id: Types.ObjectId };
export const Memory = model("Memory", memorySchema);
