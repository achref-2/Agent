import { AlertTriangle, CheckCircle2, Download, FileSearch, FileText, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { DocItem, DocStatus, UploadModal } from "../components/docs";
import { priorityTone } from "../components/tasks";
import { useToast } from "../components/toast";
import { Badge, Button, Card, CopyButton, EmptyState, ErrorBox, Notice, Select, Spinner } from "../components/ui";
import { api, errorMessage, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDateTime } from "../lib/dates";
import { useApi } from "../lib/hooks";
import type { AdminAnalysis, Doc } from "../lib/types";

function Analysis({ doc, analysis }: { doc: Doc; analysis: AdminAnalysis }) {
  const toast = useToast();
  const [picked, setPicked] = useState<Set<number>>(() => new Set(analysis.actions.map((_, i) => i)));
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  useEffect(() => { setPicked(new Set(analysis.actions.map((_, i) => i))); setCreated(false); }, [analysis]);

  async function createTasks() {
    setCreating(true);
    try {
      const tasks = analysis.actions.filter((_, i) => picked.has(i)).map((a) => ({ title: a.title, dueDate: a.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(a.dueDate) ? a.dueDate : null, priority: a.priority, description: `${a.reason}\n\nFrom document: ${doc.title}` }));
      const res = await api.post<{ tasks: unknown[] }>(`/documents/${doc.id}/tasks`, { tasks });
      toast("success", `Created ${res.tasks.length} task(s) linked to this document`);
      setCreated(true);
    } catch (err) {
      toast("error", errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card title="In plain English">
        <p className="text-sm">{analysis.plainEnglishSummary}</p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-muted">Sender</dt><dd>{analysis.sender ?? "Not stated"}</dd></div>
          <div><dt className="text-xs text-muted">Type</dt><dd>{analysis.documentType}</dd></div>
          <div><dt className="text-xs text-muted">Purpose</dt><dd>{analysis.purpose}</dd></div>
        </dl>
      </Card>

      {analysis.deadlines.length > 0 && (
        <Card title="Deadlines">
          <ul className="space-y-2">
            {analysis.deadlines.map((d, i) => (
              <li key={i} className="text-sm">
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{d.date ?? "Date unclear"}</span> {d.description}</div>
                <Quote text={d.quote} verified={d.verified} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {analysis.actions.length > 0 && (
        <Card title="Suggested actions" action={<Button size="sm" onClick={createTasks} loading={creating} disabled={!picked.size || created}>{created ? "Tasks created" : `Create ${picked.size} task(s)`}</Button>}>
          <ul className="space-y-2">
            {analysis.actions.map((a, i) => (
              <li key={i}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-2.5 text-sm">
                  <input type="checkbox" className="mt-1" checked={picked.has(i)} onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(i); else n.delete(i); setPicked(n); }} />
                  <span className="flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-medium">{a.title} <Badge tone={priorityTone(a.priority)}>{a.priority}</Badge>{a.dueDate && <span className="text-xs text-muted">due {a.dueDate}</span>}</span>
                    <span className="block text-xs text-muted">{a.reason}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Facts from the document">
          {analysis.facts.length ? (
            <ul className="space-y-2.5">{analysis.facts.map((f, i) => <li key={i} className="text-sm">{f.statement}{f.page ? <span className="text-xs text-muted"> (p. {f.page})</span> : null}<Quote text={f.quote} verified={f.verified} /></li>)}</ul>
          ) : <p className="text-sm text-muted">None extracted.</p>}
        </Card>
        <Card title="Interpretation (not stated in the document)">
          {analysis.interpretations.length ? (
            <ul className="space-y-2">{analysis.interpretations.map((x, i) => <li key={i} className="text-sm">{x.statement} <Badge tone={x.confidence === "high" ? "success" : x.confidence === "medium" ? "accent" : "warning"}>{x.confidence} confidence</Badge></li>)}</ul>
          ) : <p className="text-sm text-muted">None.</p>}
        </Card>
      </div>

      {(analysis.requiredDocuments.length > 0 || analysis.uncertainties.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {analysis.requiredDocuments.length > 0 && <Card title="Documents you'll need"><ul className="list-disc space-y-1 pl-5 text-sm">{analysis.requiredDocuments.map((d, i) => <li key={i}>{d}</li>)}</ul></Card>}
          {analysis.uncertainties.length > 0 && (
            <Card title={<span className="inline-flex items-center gap-1.5 text-warning"><AlertTriangle className="size-4" /> Check before acting</span>}>
              <ul className="list-disc space-y-1 pl-5 text-sm">{analysis.uncertainties.map((d, i) => <li key={i}>{d}</li>)}</ul>
              <p className="mt-2 text-xs text-muted">This is not legal advice. Confirm with the sender, the TH Köln advice services or a Beratungsstelle.</p>
            </Card>
          )}
        </div>
      )}

      {analysis.draftReplyGerman && (
        <Card title="Draft reply in German (review, then send yourself)" action={<CopyButton text={analysis.draftReplyGerman} />}>
          <p className="whitespace-pre-wrap text-sm">{analysis.draftReplyGerman}</p>
          {analysis.draftReplyEnglish && <details className="mt-3 text-sm"><summary className="cursor-pointer text-accent">English translation</summary><p className="mt-2 whitespace-pre-wrap text-muted">{analysis.draftReplyEnglish}</p></details>}
        </Card>
      )}
      <p className="text-xs text-muted">Analysed {formatDateTime(analysis.generatedAt)} with {analysis.model}. Quotes marked “not found” could not be matched in the original text; treat them with care.</p>
    </div>
  );
}

function Quote({ text, verified }: { text: string; verified: boolean }) {
  return (
    <span className="mt-1 flex items-start gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-xs italic text-muted">
      {verified ? <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-success" aria-label="Quote found in document" /> : <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" aria-label="Quote not found in document" />}
      “{text}”
    </span>
  );
}

export function DocumentsPage() {
  const { ai } = useAuth();
  const toast = useToast();
  const [kind, setKind] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const listQ = useApi<{ documents: Doc[] }>(`/documents${qs({ kind })}`);
  const detailQ = useApi<{ document: Doc }>(selectedId ? `/documents/${selectedId}` : null);
  const textQ = useApi<{ chunks: { page: number; text: string }[] }>(selectedId && showText ? `/documents/${selectedId}/text` : null);
  const docs = listQ.data?.documents ?? [];
  const doc = detailQ.data?.document;

  useEffect(() => { setShowText(false); setError(null); setConfirmDelete(false); }, [selectedId]);

  async function analyze() {
    if (!doc) return;
    setAnalyzing(true);
    setError(null);
    try {
      await api.post(`/documents/${doc.id}/analyze`);
      await detailQ.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAnalyzing(false);
    }
  }
  async function remove() {
    if (!doc) return;
    try {
      await api.delete(`/documents/${doc.id}`);
      toast("success", `Deleted "${doc.title}"`);
      setSelectedId(null);
      void listQ.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Documents</h1>
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setUploading(true)}>Add</Button>
        </div>
        <Select aria-label="Filter by type" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All types</option>
          <option value="admin">Official letters / admin</option>
          <option value="lecture">Lecture material</option>
          <option value="job">Job documents</option>
          <option value="other">Other</option>
        </Select>
        <div className="rounded-xl border border-border bg-surface p-2">
          {listQ.loading && !listQ.data ? <Spinner /> : listQ.error ? <ErrorBox message={listQ.error} onRetry={listQ.reload} /> : docs.length === 0 ? (
            <EmptyState icon={<FileText className="size-6" />} title="No documents" hint="Upload a letter from the Krankenkasse, Ausländerbehörde, landlord or university." />
          ) : docs.map((d) => <DocItem key={d.id} doc={d} active={d.id === selectedId} onClick={() => setSelectedId(d.id)} />)}
        </div>
      </aside>
      <section className="min-w-0 space-y-4">
        {!selectedId ? (
          <Card><EmptyState icon={<FileSearch className="size-7" />} title="Select or add a document" hint="GhostMate explains German letters in plain English, extracts deadlines and actions, and drafts a reply." /></Card>
        ) : detailQ.loading && !doc ? <Spinner /> : detailQ.error ? <ErrorBox message={detailQ.error} /> : doc ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">{doc.title} <DocStatus doc={doc} /></h2>
                <p className="text-sm text-muted">{doc.kind} · {doc.pageCount} page(s) · added {formatDateTime(doc.createdAt)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {doc.fileId && <a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-surface-2"><Download className="size-4" /> Original</a>}
                <Button size="sm" variant="outline" onClick={() => setShowText((s) => !s)}>{showText ? "Hide text" : "Show text"}</Button>
                <Button size="sm" onClick={analyze} loading={analyzing} disabled={!ai?.configured || doc.status === "needs_ocr"} icon={<Sparkles className="size-4" />}>{doc.analysis ? "Re-analyse" : "Explain & extract actions"}</Button>
                {confirmDelete ? (
                  <><Button size="sm" variant="danger" onClick={remove}>Confirm delete</Button><Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button></>
                ) : <Button size="sm" variant="ghost" aria-label="Delete document" onClick={() => setConfirmDelete(true)} icon={<Trash2 className="size-4" />} />}
              </div>
            </div>
            {doc.statusMessage && <Notice>{doc.statusMessage}</Notice>}
            {error && <ErrorBox message={error} />}
            {showText && (
              <Card title="Extracted text">
                {textQ.loading ? <Spinner /> : textQ.error ? <ErrorBox message={textQ.error} /> : (
                  <div className="max-h-96 space-y-3 overflow-y-auto text-sm">
                    {textQ.data?.chunks.map((c, i) => <div key={i}><div className="text-xs font-semibold text-muted">Page {c.page}</div><p className="whitespace-pre-wrap">{c.text}</p></div>)}
                    {!textQ.data?.chunks.length && <p className="text-muted">No text could be extracted.</p>}
                  </div>
                )}
              </Card>
            )}
            {doc.analysis ? <Analysis doc={doc} analysis={doc.analysis} /> : !analyzing && <p className="text-sm text-muted">Run “Explain &amp; extract actions” to get a plain-English explanation, deadlines, tasks and a German reply draft.</p>}
          </>
        ) : null}
      </section>
      <UploadModal open={uploading} onClose={() => setUploading(false)} defaultKind="admin" onUploaded={(d) => { void listQ.reload(); setSelectedId(d.id); }} />
    </div>
  );
}
