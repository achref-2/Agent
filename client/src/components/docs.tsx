import { FileText, FileWarning, Upload } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { api, errorMessage } from "../lib/api";
import type { Doc } from "../lib/types";
import { useToast } from "./toast";
import { Badge, Button, cx, ErrorBox, Field, Input, Modal, Select, Textarea } from "./ui";

export function DocStatus({ doc }: { doc: Doc }) {
  if (doc.status === "needs_ocr") return <Badge tone="warning"><FileWarning className="size-3" /> needs OCR</Badge>;
  if (doc.emptyPages.length) return <Badge tone="warning">partial text</Badge>;
  return null;
}

export function DocItem({ doc, active, onClick }: { doc: Doc; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cx("flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition", active ? "bg-accent-soft" : "hover:bg-surface-2")}>
      <FileText className={cx("mt-0.5 size-4 shrink-0", active ? "text-accent" : "text-muted")} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{doc.title}</span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {doc.course && <span>{doc.course} ·</span>}
          {doc.pageCount} page{doc.pageCount === 1 ? "" : "s"} <DocStatus doc={doc} />
        </span>
      </span>
    </button>
  );
}

export function UploadModal({ open, onClose, onUploaded, defaultKind }: { open: boolean; onClose: () => void; onUploaded: (d: Doc) => void; defaultKind: Doc["kind"] }) {
  const toast = useToast();
  const [mode, setMode] = useState<"file" | "text">("file");
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState({ title: "", course: "", kind: defaultKind, text: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      let res: { document: Doc };
      if (mode === "file") {
        if (!file) throw new Error("Choose a PDF or text file first.");
        const fd = new FormData();
        fd.append("file", file);
        fd.append("kind", meta.kind);
        if (meta.title) fd.append("title", meta.title);
        if (meta.course) fd.append("course", meta.course);
        res = await api.post<{ document: Doc }>("/documents/upload", fd);
      } else {
        res = await api.post<{ document: Doc }>("/documents/text", { title: meta.title || "Pasted text", text: meta.text, kind: meta.kind, course: meta.course });
      }
      toast(res.document.status === "ready" && !res.document.emptyPages.length ? "success" : "info", res.document.statusMessage || `Added "${res.document.title}"`);
      onUploaded(res.document);
      setFile(null);
      setMeta({ title: "", course: "", kind: defaultKind, text: "" });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a document" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="upload-form" loading={pending}>{mode === "file" ? "Upload" : "Save"}</Button></>}>
      <form id="upload-form" onSubmit={submit} className="space-y-4">
        <div className="flex gap-2 text-sm">
          <Button type="button" size="sm" variant={mode === "file" ? "primary" : "secondary"} onClick={() => setMode("file")}>Upload file</Button>
          <Button type="button" size="sm" variant={mode === "text" ? "primary" : "secondary"} onClick={() => setMode("text")}>Paste text</Button>
        </div>
        {mode === "file" ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
            className={cx("flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center", drag ? "border-accent bg-accent-soft" : "border-border")}
          >
            <Upload className="size-6 text-muted" />
            <p className="text-sm">{file ? <strong>{file.name}</strong> : "Drop a PDF here, or"}</p>
            <input ref={input} type="file" accept="application/pdf,.pdf,.txt,.md,text/plain" className="sr-only" id="file-input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>{file ? "Choose another file" : "Choose file"}</Button>
            <p className="text-xs text-muted">PDF, TXT or MD. Scanned PDFs can be stored but not searched (no OCR yet).</p>
          </div>
        ) : (
          <Field label="Text">{(id) => <Textarea id={id} required minLength={20} rows={8} value={meta.text} onChange={(e) => setMeta({ ...meta, text: e.target.value })} placeholder="Paste an email, letter or notes…" />}</Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title (optional)">{(id) => <Input id={id} value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />}</Field>
          <Field label="Type">
            {(id) => (
              <Select id={id} value={meta.kind} onChange={(e) => setMeta({ ...meta, kind: e.target.value as Doc["kind"] })}>
                <option value="lecture">Lecture material</option>
                <option value="admin">Official letter / admin</option>
                <option value="job">Job document</option>
                <option value="other">Other</option>
              </Select>
            )}
          </Field>
        </div>
        {meta.kind === "lecture" && <Field label="Course (optional)">{(id) => <Input id={id} value={meta.course} onChange={(e) => setMeta({ ...meta, course: e.target.value })} placeholder="e.g. Digital Signal Processing" />}</Field>}
        {error && <ErrorBox message={error} />}
      </form>
    </Modal>
  );
}
