import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { config } from "../config.js";
import { badRequest } from "../lib/errors.js";
import { objectId, parse } from "../lib/validate.js";
import { currentUser } from "../middleware/auth.js";
import { DOCUMENT_KINDS } from "../models/Document.js";
import { analyzeAdminDocument } from "../services/admin.js";
import { createFromText, createFromUpload, deleteDocument, DocumentMetaSchema, getDocument, getDocumentPages, listDocuments, openFileStream } from "../services/documents.js";
import { createTask } from "../services/tasks.js";
import { TaskCreateSchema } from "../services/tasks.js";

export const documentsRouter = Router();

// Files are kept in memory only long enough to validate and store them in GridFS; nothing is
// written to the server's filesystem, so there is no path to traverse.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 10 },
  fileFilter: (_req, file, cb) => {
    const ok = ["application/pdf", "text/plain", "text/markdown", "application/octet-stream"].includes(file.mimetype);
    if (ok) cb(null, true);
    else cb(badRequest("Only PDF and plain-text files are supported."));
  },
});

documentsRouter.get("/", async (req, res) => {
  const q = parse(z.object({ kind: z.enum(DOCUMENT_KINDS).optional(), search: z.string().max(200).optional() }), req.query);
  res.json({ documents: await listDocuments(currentUser(req), q) });
});

documentsRouter.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) throw badRequest("Attach a file in the 'file' field.");
  const meta = parse(DocumentMetaSchema, req.body);
  res.status(201).json({ document: await createFromUpload(currentUser(req), req.file, meta) });
});

documentsRouter.post("/text", async (req, res) => {
  const input = parse(
    z.object({ title: z.string().trim().min(1).max(200), text: z.string().trim().min(20).max(200_000), kind: z.enum(DOCUMENT_KINDS).default("other"), course: z.string().max(120).optional() }),
    req.body,
  );
  res.status(201).json({ document: await createFromText(currentUser(req), input) });
});

documentsRouter.get("/:id", async (req, res) => {
  res.json({ document: await getDocument(currentUser(req), req.params.id) });
});

documentsRouter.get("/:id/text", async (req, res) => {
  const { chunks } = await getDocumentPages(currentUser(req), req.params.id);
  res.json({ chunks });
});

documentsRouter.get("/:id/file", async (req, res) => {
  const { doc, stream } = await openFileStream(currentUser(req), req.params.id);
  res.setHeader("Content-Type", doc.mimeType === "application/pdf" ? "application/pdf" : "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.originalName || "document")}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  stream.on("error", () => res.destroy()).pipe(res);
});

documentsRouter.patch("/:id", async (req, res) => {
  const input = parse(z.object({ title: z.string().trim().min(1).max(200), kind: z.enum(DOCUMENT_KINDS), course: z.string().max(120) }).partial(), req.body);
  const doc = await getDocument(currentUser(req), req.params.id);
  doc.set(input);
  await doc.save();
  res.json({ document: doc });
});

documentsRouter.delete("/:id", async (req, res) => {
  res.json(await deleteDocument(currentUser(req), req.params.id));
});

documentsRouter.post("/:id/analyze", async (req, res) => {
  res.json({ analysis: await analyzeAdminDocument(currentUser(req), req.params.id) });
});

// Turns selected suggested actions into real tasks linked to the document.
documentsRouter.post("/:id/tasks", async (req, res) => {
  const user = currentUser(req);
  const doc = await getDocument(user, req.params.id);
  const { tasks } = parse(z.object({ tasks: z.array(TaskCreateSchema.omit({ documentId: true })).min(1).max(30) }), req.body);
  const created = [];
  for (const t of tasks) created.push(await createTask(user, { category: "admin", ...t, documentId: String(doc._id) }, "document"));
  res.status(201).json({ tasks: created });
});

export const documentIdList = z.array(objectId).max(20);
