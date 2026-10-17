import { Schema, model, type InferSchemaType, Types } from "mongoose";
import { baseOptions } from "./common.js";

export const DOCUMENT_KINDS = ["lecture", "admin", "job", "other"] as const;

const documentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    kind: { type: String, enum: DOCUMENT_KINDS, default: "other" },
    course: { type: String, default: "", maxlength: 120 },
    originalName: { type: String, default: "", maxlength: 255 },
    mimeType: { type: String, required: true },
    size: { type: Number, default: 0 },
    fileId: { type: Schema.Types.ObjectId, default: null }, // GridFS file with the original bytes
    pageCount: { type: Number, default: 1 },
    textLength: { type: Number, default: 0 },
    // Pages whose text layer was empty (likely scanned images). OCR is not available in this build.
    emptyPages: { type: [Number], default: [] },
    status: { type: String, enum: ["ready", "needs_ocr", "failed"], default: "ready" },
    statusMessage: { type: String, default: "" },
    summary: { type: String, default: "" },
    analysis: { type: Schema.Types.Mixed, default: null }, // admin-document analysis
  },
  baseOptions,
);

export type DocumentDoc = InferSchemaType<typeof documentSchema> & { _id: Types.ObjectId };
export const DocumentModel = model("Document", documentSchema);

const chunkSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true },
  documentId: { type: Schema.Types.ObjectId, required: true },
  page: { type: Number, required: true },
  index: { type: Number, required: true },
  text: { type: String, required: true },
  terms: { type: [String], default: [] },
});
chunkSchema.index({ userId: 1, documentId: 1, index: 1 });

export type ChunkDoc = InferSchemaType<typeof chunkSchema> & { _id: Types.ObjectId };
export const Chunk = model("Chunk", chunkSchema);
