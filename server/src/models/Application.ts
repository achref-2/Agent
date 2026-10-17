import { Schema, model, type InferSchemaType, Types } from "mongoose";
import { baseOptions } from "./common.js";

export const APPLICATION_STATUSES = ["saved", "preparing", "applied", "interview", "rejected", "offer"] as const;
export const EMPLOYMENT_TYPES = ["werkstudent", "minijob", "internship", "part_time", "full_time", "thesis", "other"] as const;

const draftSchema = new Schema(
  {
    kind: { type: String, enum: ["cover_letter", "follow_up", "interview_prep", "message"], required: true },
    language: { type: String, enum: ["de", "en"], default: "de" },
    content: { type: String, required: true, maxlength: 20000 },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: true },
);

const applicationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    company: { type: String, required: true, trim: true, maxlength: 200 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    url: { type: String, default: "", maxlength: 2000 },
    location: { type: String, default: "", maxlength: 200 },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, default: "werkstudent" },
    status: { type: String, enum: APPLICATION_STATUSES, default: "saved" },
    appliedDate: { type: String, default: null },
    followUpDate: { type: String, default: null },
    contact: {
      name: { type: String, default: "" },
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
    },
    notes: { type: String, default: "", maxlength: 10000 },
    description: { type: String, default: "", maxlength: 30000 }, // pasted job ad
    requirements: {
      summary: { type: String, default: "" },
      mustHave: { type: [String], default: [] },
      niceToHave: { type: [String], default: [] },
      languages: { type: [String], default: [] },
    },
    fitAnalysis: { type: Schema.Types.Mixed, default: null },
    drafts: { type: [draftSchema], default: [] },
    documentIds: { type: [Schema.Types.ObjectId], ref: "Document", default: [] },
  },
  baseOptions,
);
applicationSchema.index({ userId: 1, status: 1 });

export type ApplicationDoc = InferSchemaType<typeof applicationSchema> & { _id: Types.ObjectId };
export const Application = model("Application", applicationSchema);
