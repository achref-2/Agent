import mongoose, { Types } from "mongoose";
import { Readable } from "node:stream";
import { z } from "zod";
import { badRequest, notFound } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { escapeRegex } from "../lib/validate.js";
import { Chunk, DocumentModel, DOCUMENT_KINDS } from "../models/Document.js";
import type { UserDoc } from "../models/User.js";
import { extractPdfText, isPdf } from "./pdf.js";
import { chunkPages, tokenize } from "./retrieval.js";

export const DocumentMetaSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  kind: z.enum(DOCUMENT_KINDS).default("other"),
  course: z.string().max(120).optional(),
});

function bucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: "uploads" });
}

function cleanName(name: string) {
  // Display only: the original bytes are stored in GridFS under a generated id, never a path.
  return name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 200);
}

async function storeChunks(userId: Types.ObjectId, documentId: Types.ObjectId, pages: string[]) {
  const chunks = chunkPages(pages).map((c, index) => ({ ...c, index, userId, documentId, terms: tokenize(c.text) }));
  if (chunks.length) await Chunk.insertMany(chunks);
  return chunks.length;
}

export async function createFromUpload(
  user: UserDoc,
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  meta: z.infer<typeof DocumentMetaSchema>,
) {
  const originalName = cleanName(file.originalname || "upload");
  const lower = originalName.toLowerCase();
  let pages: string[];
  let emptyPages: number[] = [];
  let mimeType: string;

  if (isPdf(file.buffer)) {
    mimeType = "application/pdf";
    try {
      ({ pages, emptyPages } = await extractPdfText(file.buffer));
    } catch (err) {
      logger.warn("PDF extraction failed", { err: err instanceof Error ? err.message : String(err) });
      throw badRequest("Could not read this PDF. It may be damaged or password-protected.");
    }
  } else if ((lower.endsWith(".txt") || lower.endsWith(".md")) && !file.buffer.includes(0)) {
    mimeType = "text/plain";
    pages = [file.buffer.toString("utf8")];
  } else {
    throw badRequest("Only PDF and plain-text (.txt, .md) files are supported.");
  }

  const fileId = await new Promise<Types.ObjectId>((resolve, reject) => {
    const upload = bucket().openUploadStream(originalName, { metadata: { userId: user._id, mimeType } });
    Readable.from(file.buffer).pipe(upload).on("error", reject).on("finish", () => resolve(upload.id as Types.ObjectId));
  });

  const textLength = pages.reduce((s, p) => s + p.length, 0);
  const allEmpty = emptyPages.length === pages.length;
  const status = allEmpty ? "needs_ocr" : "ready";
  const statusMessage = allEmpty
    ? "No text layer found. This looks like a scanned PDF; OCR is not available in this version, so its contents cannot be searched or summarized."
    : emptyPages.length
      ? `Pages ${emptyPages.join(", ")} have no extractable text (probably images or scans) and are not searchable.`
      : "";

  const doc = await DocumentModel.create({
    userId: user._id,
    title: meta.title || originalName.replace(/\.(pdf|txt|md)$/i, ""),
    kind: meta.kind,
    course: meta.course ?? "",
    originalName,
    mimeType,
    size: file.size,
    fileId,
    pageCount: pages.length,
    textLength,
    emptyPages,
    status,
    statusMessage,
  });
  await storeChunks(user._id, doc._id, pages);
  return doc;
}

export async function createFromText(user: UserDoc, input: { title: string; text: string; kind: (typeof DOCUMENT_KINDS)[number]; course?: string }) {
  const doc = await DocumentModel.create({
    userId: user._id,
    title: input.title,
    kind: input.kind,
    course: input.course ?? "",
    mimeType: "text/plain",
    size: Buffer.byteLength(input.text),
    pageCount: 1,
    textLength: input.text.length,
  });
  await storeChunks(user._id, doc._id, [input.text]);
  return doc;
}

export async function getDocument(user: UserDoc, id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound("Document");
  const doc = await DocumentModel.findOne({ _id: id, userId: user._id });
  if (!doc) throw notFound("Document");
  return doc;
}

export async function listDocuments(user: UserDoc, opts: { kind?: string; search?: string } = {}) {
  const q: Record<string, unknown> = { userId: user._id };
  if (opts.kind) q.kind = opts.kind;
  if (opts.search) q.title = new RegExp(escapeRegex(opts.search), "i");
  return DocumentModel.find(q).sort({ createdAt: -1 }).select("-analysis").limit(200);
}

/** Full text with page markers, in reading order. */
export async function getDocumentPages(user: UserDoc, id: string) {
  const doc = await getDocument(user, id);
  const chunks = await Chunk.find({ userId: user._id, documentId: doc._id }).sort({ index: 1 }).lean();
  return { doc, chunks: chunks.map((c) => ({ page: c.page, text: c.text })) };
}

export async function openFileStream(user: UserDoc, id: string) {
  const doc = await getDocument(user, id);
  if (!doc.fileId) throw notFound("Original file");
  return { doc, stream: bucket().openDownloadStream(doc.fileId) };
}

export async function deleteDocument(user: UserDoc, id: string) {
  const doc = await getDocument(user, id);
  await Chunk.deleteMany({ userId: user._id, documentId: doc._id });
  if (doc.fileId) await bucket().delete(doc.fileId).catch(() => undefined);
  await doc.deleteOne();
  return { id, title: doc.title };
}
