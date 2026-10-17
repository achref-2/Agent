import { Schema, model, type InferSchemaType, Types } from "mongoose";
import { baseOptions } from "./common.js";

const toolActivitySchema = new Schema(
  {
    name: String,
    input: Schema.Types.Mixed,
    ok: Boolean,
    summary: String,
    pendingActionId: { type: String, default: null },
  },
  { _id: false },
);

const messageSchema = new Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    toolActivity: { type: [toolActivitySchema], default: [] },
    // Mode-specific structured payload (e.g. German corrections).
    meta: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: true },
);

const conversationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    mode: { type: String, enum: ["assistant", "german"], default: "assistant" },
    title: { type: String, default: "New conversation", maxlength: 120 },
    scenario: { type: String, default: "" }, // German practice scenario
    messages: { type: [messageSchema], default: [] },
  },
  baseOptions,
);

export type ConversationDoc = InferSchemaType<typeof conversationSchema> & { _id: Types.ObjectId };
export const Conversation = model("Conversation", conversationSchema);
