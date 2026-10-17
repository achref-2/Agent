import { Briefcase, ExternalLink, FileSignature, MessageSquareReply, Plus, Search, Sparkles, Target, Trash2, Wand2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useToast } from "../components/toast";
import { Badge, Button, Card, CopyButton, cx, EmptyState, ErrorBox, Field, Input, Markdown, Modal, Notice, Select, Spinner, Tabs, Textarea } from "../components/ui";
import { api, errorMessage, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, formatDateTime, todayISO } from "../lib/dates";
import { useApi } from "../lib/hooks";
import type { AppStatus, FitAnalysis, JobApplication } from "../lib/types";

const STATUSES: AppStatus[] = ["saved", "preparing", "applied", "interview", "offer", "rejected"];
const statusTone = (s: AppStatus) => (s === "offer" ? "success" : s === "rejected" ? "danger" : s === "interview" ? "purple" : s === "applied" ? "accent" : "neutral");
const TYPES = [
  ["werkstudent", "Werkstudent"],
  ["minijob", "Minijob"],
  ["internship", "Internship"],
  ["part_time", "Part-time"],
  ["full_time", "Full-time"],
  ["thesis", "Thesis"],
  ["other", "Other"],
] as const;

interface Parsed {
  company: string | null; title: string | null; location: string | null; employmentType: string | null; summary: string;
  mustHave: string[]; niceToHave: string[]; languages: string[]; applicationDeadline: string | null; contactName: string | null; contactEmail: string | null;
}

function AddModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (a: JobApplication) => void }) {
  const { ai } = useAuth();
  const toast = useToast();
  const empty = { company: "", title: "", url: "", location: "Köln", employmentType: "werkstudent", status: "saved", description: "", contactName: "", contactEmail: "" };
  const [form, setForm] = useState(empty);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [parsing, setParsing] = useState(false);
  useEffect(() => { if (open) { setForm(empty); setParsed(null); setError(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function parse() {
    setParsing(true);
    setError(null);
    try {
      const res = await api.post<{ parsed: Parsed }>("/applications/parse", { text: form.description });
      const p = res.parsed;
      setParsed(p);
      setForm((f) => ({
        ...f,
        company: p.company ?? f.company,
        title: p.title ?? f.title,
        location: p.location ?? f.location,
        employmentType: p.employmentType ?? f.employmentType,
        contactName: p.contactName ?? f.contactName,
        contactEmail: p.contactEmail ?? f.contactEmail,
      }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setParsing(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await api.post<{ application: JobApplication }>("/applications", {
        company: form.company, title: form.title, url: form.url, location: form.location, employmentType: form.employmentType, status: form.status,
        description: form.description, contact: { name: form.contactName, email: form.contactEmail },
        followUpDate: null,
      });
      let app = res.application;
      if (parsed) {
        const up = await api.patch<{ application: JobApplication }>(`/applications/${app.id}`, { requirements: { summary: parsed.summary, mustHave: parsed.mustHave, niceToHave: parsed.niceToHave, languages: parsed.languages } });
        app = up.application;
      }
      toast("success", `Added ${app.title} at ${app.company}`);
      onCreated(app);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Modal open={open} onClose={onClose} title="Add application" wide footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="add-app" loading={pending}>Save</Button></>}>
      <form id="add-app" onSubmit={save} className="space-y-4">
        <Field label="Job description (paste the ad)" hint="GhostMate extracts the details. Only what the ad says is used; nothing is invented.">
          {(id) => <Textarea id={id} rows={6} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Paste the full job posting here…" />}
        </Field>
        <Button type="button" variant="secondary" size="sm" onClick={parse} loading={parsing} disabled={!ai?.configured || form.description.trim().length < 40} icon={<Wand2 className="size-4" />}>Extract details with AI</Button>
        {parsed && (
          <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
            <p>{parsed.summary}</p>
            {parsed.mustHave.length > 0 && <p className="mt-2 text-xs"><span className="font-medium">Must have:</span> {parsed.mustHave.join(" · ")}</p>}
            {parsed.languages.length > 0 && <p className="mt-1 text-xs"><span className="font-medium">Languages:</span> {parsed.languages.join(" · ")}</p>}
            {parsed.applicationDeadline && <p className="mt-1 text-xs"><span className="font-medium">Deadline in ad:</span> {parsed.applicationDeadline}</p>}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Company">{(id) => <Input id={id} required value={form.company} onChange={(e) => set("company", e.target.value)} />}</Field>
          <Field label="Job title">{(id) => <Input id={id} required value={form.title} onChange={(e) => set("title", e.target.value)} />}</Field>
          <Field label="Job URL">{(id) => <Input id={id} type="url" value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" />}</Field>
          <Field label="Location">{(id) => <Input id={id} value={form.location} onChange={(e) => set("location", e.target.value)} />}</Field>
          <Field label="Employment type">{(id) => <Select id={id} value={form.employmentType} onChange={(e) => set("employmentType", e.target.value)}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
          <Field label="Status">{(id) => <Select id={id} value={form.status} onChange={(e) => set("status", e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>}</Field>
          <Field label="Contact name">{(id) => <Input id={id} value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />}</Field>
          <Field label="Contact email">{(id) => <Input id={id} type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />}</Field>
        </div>
        {error && <ErrorBox message={error} />}
      </form>
    </Modal>
  );
}

function FitView({ fit }: { fit: FitAnalysis }) {
  const tone = fit.overallFit === "strong" ? "success" : fit.overallFit === "moderate" ? "accent" : fit.overallFit === "weak" ? "danger" : "neutral";
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2">Overall fit: <Badge tone={tone}>{fit.overallFit}</Badge></div>
      <p>{fit.priorityAdvice}</p>
      {fit.matches.length > 0 && <div><h4 className="text-xs font-semibold uppercase tracking-wider text-success">Matches</h4><ul className="mt-1 space-y-1">{fit.matches.map((m, i) => <li key={i}><span className="font-medium">{m.requirement}</span> <span className="text-muted">· {m.evidence}</span></li>)}</ul></div>}
      {fit.gaps.length > 0 && <div><h4 className="text-xs font-semibold uppercase tracking-wider text-danger">Gaps (honest)</h4><ul className="mt-1 space-y-1">{fit.gaps.map((m, i) => <li key={i}><span className="font-medium">{m.requirement}</span> <span className="text-muted">· {m.suggestion}</span></li>)}</ul></div>}
      {fit.unclear.length > 0 && <div><h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Not covered by your profile</h4><p className="mt-1 text-muted">{fit.unclear.join(" · ")}</p></div>}
      {fit.talkingPoints.length > 0 && <div><h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Talking points</h4><ul className="mt-1 list-disc pl-5">{fit.talkingPoints.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
    </div>
  );
}

function Detail({ app, onChanged, onDeleted }: { app: JobApplication; onChanged: (a: JobApplication) => void; onDeleted: () => void }) {
  const { ai } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(app);
  const [tab, setTab] = useState<"details" | "fit" | "drafts">("details");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draftLang, setDraftLang] = useState<"de" | "en">("de");
  useEffect(() => { setForm(app); setError(null); setConfirmDelete(false); }, [app]);

  async function save() {
    setBusy("save");
    setError(null);
    try {
      const res = await api.patch<{ application: JobApplication }>(`/applications/${app.id}`, {
        company: form.company, title: form.title, url: form.url, location: form.location, employmentType: form.employmentType as never, status: form.status,
        appliedDate: form.appliedDate || null, followUpDate: form.followUpDate || null, contact: form.contact, notes: form.notes, description: form.description,
      });
      onChanged(res.application);
      toast("success", "Application saved");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }
  async function analyze() {
    setBusy("fit");
    setError(null);
    try {
      await api.post(`/applications/${app.id}/analyze`);
      const res = await api.get<{ application: JobApplication }>(`/applications/${app.id}`);
      onChanged(res.application);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }
  async function draft(kind: string) {
    setBusy(kind);
    setError(null);
    try {
      await api.post(`/applications/${app.id}/drafts`, { kind, language: draftLang });
      const res = await api.get<{ application: JobApplication }>(`/applications/${app.id}`);
      onChanged(res.application);
      setTab("drafts");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }
  async function remove() {
    try {
      await api.delete(`/applications/${app.id}`);
      toast("success", "Application deleted");
      onDeleted();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{app.title}</h2>
          <p className="text-sm text-muted">{app.company}{app.location && ` · ${app.location}`}</p>
        </div>
        {app.url && <a href={app.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">Job ad <ExternalLink className="size-3.5" /></a>}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "details", label: "Details" }, { id: "fit", label: "Fit analysis", icon: <Target className="size-3.5" /> }, { id: "drafts", label: `Drafts (${app.drafts.length})`, icon: <FileSignature className="size-3.5" /> }]} />
      {error && <ErrorBox message={error} />}
      {tab === "details" && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status">{(id) => <Select id={id} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AppStatus, appliedDate: e.target.value === "applied" && !form.appliedDate ? todayISO() : form.appliedDate })}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>}</Field>
            <Field label="Employment type">{(id) => <Select id={id} value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
            <Field label="Applied on">{(id) => <Input id={id} type="date" value={form.appliedDate ?? ""} onChange={(e) => setForm({ ...form, appliedDate: e.target.value })} />}</Field>
            <Field label="Follow up on">{(id) => <Input id={id} type="date" value={form.followUpDate ?? ""} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} />}</Field>
            <Field label="Company">{(id) => <Input id={id} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />}</Field>
            <Field label="Title">{(id) => <Input id={id} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}</Field>
            <Field label="Location">{(id) => <Input id={id} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />}</Field>
            <Field label="Job URL">{(id) => <Input id={id} type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />}</Field>
            <Field label="Contact name">{(id) => <Input id={id} value={form.contact.name} onChange={(e) => setForm({ ...form, contact: { ...form.contact, name: e.target.value } })} />}</Field>
            <Field label="Contact email">{(id) => <Input id={id} value={form.contact.email} onChange={(e) => setForm({ ...form, contact: { ...form.contact, email: e.target.value } })} />}</Field>
          </div>
          {app.requirements.summary && (
            <div className="rounded-lg bg-surface-2 p-3 text-sm">
              <p>{app.requirements.summary}</p>
              {app.requirements.mustHave.length > 0 && <p className="mt-2 text-xs"><span className="font-medium">Must have:</span> {app.requirements.mustHave.join(" · ")}</p>}
              {app.requirements.niceToHave.length > 0 && <p className="mt-1 text-xs"><span className="font-medium">Nice to have:</span> {app.requirements.niceToHave.join(" · ")}</p>}
            </div>
          )}
          <Field label="Notes">{(id) => <Textarea id={id} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}</Field>
          <Field label="Job description">{(id) => <Textarea id={id} rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}</Field>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {confirmDelete ? (
              <div className="flex items-center gap-2 text-sm">Delete this application? <Button size="sm" variant="danger" onClick={remove}>Delete</Button><Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button></div>
            ) : (
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>Delete</Button>
            )}
            <Button onClick={save} loading={busy === "save"}>Save changes</Button>
          </div>
        </div>
      )}
      {tab === "fit" && (
        <div className="space-y-3">
          <Button onClick={analyze} loading={busy === "fit"} disabled={!ai?.configured} icon={<Sparkles className="size-4" />}>{app.fitAnalysis ? "Re-analyse" : "Compare with my profile"}</Button>
          <p className="text-xs text-muted">Uses only your profile from Memory &amp; Settings and the job description.</p>
          {app.fitAnalysis ? <Card><FitView fit={app.fitAnalysis} />{app.fitAnalysis.generatedAt && <p className="mt-3 text-xs text-muted">Generated {formatDateTime(app.fitAnalysis.generatedAt)}</p>}</Card> : <EmptyState title="No analysis yet" />}
        </div>
      )}
      {tab === "drafts" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Draft language" className="h-8 w-auto" value={draftLang} onChange={(e) => setDraftLang(e.target.value as "de" | "en")}><option value="de">Deutsch</option><option value="en">English</option></Select>
            <Button size="sm" variant="secondary" disabled={!ai?.configured} loading={busy === "cover_letter"} onClick={() => draft("cover_letter")} icon={<FileSignature className="size-4" />}>Cover letter</Button>
            <Button size="sm" variant="secondary" disabled={!ai?.configured} loading={busy === "interview_prep"} onClick={() => draft("interview_prep")} icon={<Target className="size-4" />}>Interview prep</Button>
            <Button size="sm" variant="secondary" disabled={!ai?.configured} loading={busy === "follow_up"} onClick={() => draft("follow_up")} icon={<MessageSquareReply className="size-4" />}>Follow-up email</Button>
          </div>
          <Notice tone="accent">Drafts are for you to review, edit and send yourself. GhostMate never sends applications or emails.</Notice>
          {[...app.drafts].reverse().map((d) => (
            <Card key={d._id} title={`${d.kind.replace("_", " ")} · ${d.language.toUpperCase()} · ${formatDateTime(d.createdAt)}`} action={<div className="flex gap-1"><CopyButton text={d.content} /><Button size="sm" variant="ghost" aria-label="Delete draft" onClick={async () => { await api.delete(`/applications/${app.id}/drafts/${d._id}`); const r = await api.get<{ application: JobApplication }>(`/applications/${app.id}`); onChanged(r.application); }}><Trash2 className="size-4" /></Button></div>}>
              <Markdown>{d.content}</Markdown>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function JobsPage() {
  const [status, setStatus] = useState<AppStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<JobApplication | null>(null);
  const listQ = useApi<{ applications: JobApplication[] }>(`/applications${qs({ status: status === "all" ? undefined : status, search })}`);
  const apps = listQ.data?.applications ?? [];

  async function select(id: string) {
    const res = await api.get<{ application: JobApplication }>(`/applications/${id}`);
    setSelected(res.application);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight"><Briefcase className="size-5 text-accent" /> Job Applications</h1>
          <p className="text-sm text-muted">Track student jobs in Köln and around. Add jobs by pasting the ad.</p>
        </div>
        <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Add application</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input aria-label="Search applications" className="pl-9" placeholder="Search company, title, notes" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select aria-label="Filter by status" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value as AppStatus | "all")}>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(280px,380px)_1fr]">
        <div className="space-y-2">
          {listQ.loading && !listQ.data ? <Spinner /> : listQ.error ? <ErrorBox message={listQ.error} onRetry={listQ.reload} /> : apps.length === 0 ? (
            <EmptyState icon={<Briefcase className="size-6" />} title="No applications" hint="Paste a job ad to start tracking it." action={<Button size="sm" onClick={() => setAdding(true)}>Add application</Button>} />
          ) : (
            apps.map((a) => (
              <button key={a.id} onClick={() => void select(a.id)} className={cx("w-full rounded-xl border bg-surface p-3 text-left transition hover:border-accent/60", selected?.id === a.id ? "border-accent ring-1 ring-accent" : "border-border")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{a.title}</div>
                    <div className="truncate text-xs text-muted">{a.company}{a.location && ` · ${a.location}`}</div>
                  </div>
                  <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
                  {a.appliedDate && <span>Applied {formatDate(a.appliedDate, { day: "numeric", month: "short" })}</span>}
                  {a.followUpDate && <span className={cx(a.followUpDate <= todayISO() && "font-medium text-warning")}>Follow up {formatDate(a.followUpDate, { day: "numeric", month: "short" })}</span>}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="min-w-0 rounded-xl border border-border bg-surface p-4">
          {selected ? (
            <Detail app={selected} onChanged={(a) => { setSelected(a); void listQ.reload(); }} onDeleted={() => { setSelected(null); void listQ.reload(); }} />
          ) : (
            <EmptyState title="Select an application" hint="See details, compare it with your profile and draft a German cover letter." />
          )}
        </div>
      </div>
      <AddModal open={adding} onClose={() => setAdding(false)} onCreated={(a) => { void listQ.reload(); setSelected(a); }} />
    </div>
  );
}
