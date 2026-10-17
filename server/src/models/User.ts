import { Schema, model, type InferSchemaType } from "mongoose";
import { baseOptions } from "./common.js";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    timezone: { type: String, default: "Europe/Berlin" },
    memoryEnabled: { type: Boolean, default: true },
    // Career profile used for job matching. Only what the user typed in themselves.
    profile: {
      headline: { type: String, default: "", maxlength: 300 },
      background: { type: String, default: "", maxlength: 6000 },
      skills: { type: [String], default: [] },
      languages: { type: String, default: "", maxlength: 500 },
      location: { type: String, default: "Köln", maxlength: 120 },
    },
    german: {
      level: { type: String, enum: ["A1", "A2", "B1", "B2", "C1", "C2"], default: "B1" },
      goals: { type: String, default: "", maxlength: 1000 },
      explanationLanguage: { type: String, enum: ["en", "fr", "tn"], default: "en" },
    },
  },
  baseOptions,
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: import("mongoose").Types.ObjectId };
export const User = model("User", userSchema);
