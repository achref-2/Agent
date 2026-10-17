import { BookOpen, BrainCircuit, CalendarRange, CheckCircle2, CircleHelp, Layers, ListChecks, Plus, Sparkles, Trash2, TrendingUp, XCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { DocItem, UploadModal } from "../components/docs";
import { useToast } from "../components/toast";
import { Badge, Button, Card, cx, EmptyState, ErrorBox, Field, IconButton, Input, Markdown, Notice, Select, Spinner, Tabs, Textarea } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { addDays, formatDate, todayISO } from "../lib/dates";
import { useApi } from "../lib/hooks";
import type { Doc } from "../lib/types";

type Tab = "ask" | "summary" | "explain" | "practice" | "plan" | "progress";
type Level = "beginner" | "advanced";

interface Citation { passage: number; documentTitle: string; page: number; quote: string; verified: boolean }
interface AskResult { answer: string; answeredFromSources: boolean; citations: Citation[]; generalKnowledgeNote: string | null; passagesConsidered: number }

function Citations({ items }: { items: Citation[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3 space-y-1.5 border-t border-border pt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Sources</h4>
      {items.map((c, i) => (
        <div key={i} className="rounded-md bg-surface-2 px-2.5 py-1.5 text-xs">
          <span className="font-medium">[{c.passage}] {c.documentTitle}, p. {c.page}</span>{" "}
          {c.verified ? <Badge tone="success">quote verified</Badge> : <Badge tone="warning">quote not found verbatim</Badge>}
          <p className="mt-0.5 italic text-muted">“{c.quote}”</p>
        </div>
      ))}
    </div>
  );
}

function LevelSelect({ value, onChange }: { value: Level; onChange: (l: Level) => void }) {
  return (
    <Select aria-label="Explanation level" value={value} onChange={(e) => onChange(e.target.value as Level)} className="w-auto">
      <option value="beginner">Beginner-friendly</option>
      <option value="advanced">Advanced</option>
    </Select>
  );
}

function AskTab({ docs, selected }: { docs: Doc[]; selected: Doc | null }) {
  const [question, setQuestion] = useState("");
  const [scope, setScope] = useState<"selected" | "all">("selected");
  const [level, setLevel] = useState<Level>("beginner");
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function ask(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      setResult(await api.post<AskResult>("/study/ask", { question, level, documentIds: scope === "selected" && selected ? [selected.id] : docs.map((d) => d.id) }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-4">
      <form onSubmit={ask} className="space-y-3">
        <Field label="Question about your lecture materials">{(id) => <Textarea id={id} required minLength={3} rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Why does sampling below the Nyquist rate cause aliasing?" />}</Field>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Search scope" value={scope} onChange={(e) => setScope(e.target.value as "selected" | "all")} className="w-auto">
            <option value="selected" disabled={!selected}>Only “{selected?.title ?? "selected document"}”</option>
            <option value="all">All lecture documents</option>
          </Select>
          <LevelSelect value={level} onChange={setLevel} />
          <Button type="submit" loading={pending} icon={<CircleHelp className="size-4" />}>Ask</Button>
        </div>
      </form>
      {error && <ErrorBox message={error} />}
      {result && (
        <Card>
          {!result.answeredFromSources && <div className="mb-3"><Notice>Your documents do not clearly answer this. Anything below that is not cited comes from general knowledge, not your slides.</Notice></div>}
          <Markdown>{result.answer}</Markdown>
          {result.generalKnowledgeNote && <p className="mt-2 text-xs text-muted">Note: {result.generalKnowledgeNote}</p>}
          <Citations items={result.citations} />
          <p className="mt-2 text-xs text-muted">Searched {result.passagesConsidered} relevant passage(s).</p>
        </Card>
      )}
    </div>
  );
}

function SummaryTab({ doc, onUpdated }: { doc: Doc; onUpdated: () => void }) {
  const [level, setLevel] = useState<Level>("beginner");
  const [summary, setSummary] = useState(doc.summary);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function run() {
    setPending(true);
    setError(null);
    try {
      const res = await api.post<{ summary: string }>("/study/summarize", { documentId: doc.id, level });
      setSummary(res.summary);
      onUpdated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <LevelSelect value={level} onChange={setLevel} />
        <Button onClick={run} loading={pending} icon={<Sparkles className="size-4" />}>{summary ? "Regenerate summary" : "Summarize"}</Button>
      </div>
      {error && <ErrorBox message={error} />}
      {summary ? <Card><Markdown>{summary}</Markdown></Card> : <EmptyState title="No summary yet" hint="Summaries reference page numbers from the PDF." />}
    </div>
  );
}

function ExplainTab({ selected }: { selected: Doc | null }) {
  const [concept, setConcept] = useState("");
  const [level, setLevel] = useState<Level>("beginner");
  const [useDoc, setUseDoc] = useState(true);
  const [result, setResult] = useState<{ explanation: string; citations: Citation[]; generalKnowledgeNote: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function run(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      setResult(await api.post("/study/explain", { concept, level, documentIds: useDoc && selected ? [selected.id] : undefined }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-4">
      <form onSubmit={run} className="space-y-3">
        <Field label="Concept">{(id) => <Input id={id} required value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="e.g. z-transform, convolution, backpropagation" />}</Field>
        <div className="flex flex-wrap items-center gap-3">
          <LevelSelect value={level} onChange={setLevel} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useDoc && Boolean(selected)} disabled={!selected} onChange={(e) => setUseDoc(e.target.checked)} /> Base it on “{selected?.title ?? "selected document"}”</label>
          <Button type="submit" loading={pending} icon={<BrainCircuit className="size-4" />}>Explain</Button>
        </div>
      </form>
      {error && <ErrorBox message={error} />}
      {result && (
        <Card>
          <Markdown>{result.explanation}</Markdown>
          {result.generalKnowledgeNote && <p className="mt-2 text-xs text-muted">{result.generalKnowledgeNote}</p>}
          <Citations items={result.citations} />
        </Card>
      )}
    </div>
  );
}

interface QuizItem { question: string; options: string[]; correctIndex: number; explanation: string; topic: string; page: number | null }
interface CardItem { front: string; back: string; topic: string; page: number | null }
interface ExItem { prompt: string; solution: string; difficulty: string; topic: string; page: number | null }

function QuizQuestion({ q, index, course }: { q: QuizItem; index: number; course: string }) {
  const [picked, setPicked] = useState<number | null>(null);
  async function pick(i: number) {
    if (picked !== null) return;
    setPicked(i);
    await api.post("/study/topics/result", { topic: q.topic, course, correct: i === q.correctIndex }).catch(() => undefined);
  }
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-sm font-medium">{index + 1}. {q.question}</p>
      <div className="mt-2 grid gap-1.5">
        {q.options.map((o, i) => (
          <button
            key={i}
            onClick={() => void pick(i)}
            disabled={picked !== null}
            className={cx(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition",
              picked === null ? "border-border hover:border-accent" : i === q.correctIndex ? "border-success bg-success-soft" : i === picked ? "border-danger bg-danger-soft" : "border-border opacity-60",
            )}
          >
            {picked !== null && i === q.correctIndex && <CheckCircle2 className="size-4 text-success" />}
            {picked === i && i !== q.correctIndex && <XCircle className="size-4 text-danger" />}
            {o}
          </button>
        ))}
      </div>
      {picked !== null && <p className="mt-2 text-xs text-muted">{q.explanation}{q.page ? ` (p. ${q.page})` : ""} · Topic: {q.topic}</p>}
    </div>
  );
}

function FlashCard({ c }: { c: CardItem }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button onClick={() => setFlipped((f) => !f)} className="flex min-h-32 flex-col justify-between rounded-xl border border-border bg-surface-2 p-4 text-left transition hover:border-accent" aria-label={flipped ? "Show front" : "Show answer"}>
      <span className="text-sm">{flipped ? c.back : c.front}</span>
      <span className="mt-3 text-[11px] text-muted">{flipped ? "Answer" : "Tap to reveal"} · {c.topic}{c.page ? ` · p. ${c.page}` : ""}</span>
    </button>
  );
}

function PracticeTab({ doc }: { doc: Doc }) {
  const [type, setType] = useState<"quiz" | "flashcards" | "exercises">("quiz");
  const [count, setCount] = useState(5);
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<Level>("beginner");
  const [result, setResult] = useState<{ type: string; items: unknown[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  async function run(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setRevealed(new Set());
    try {
      setResult(await api.post("/study/material", { documentId: doc.id, type, count, topic: topic || undefined, level }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-4">
      <form onSubmit={run} className="flex flex-wrap items-end gap-2">
        <Field label="Type">{(id) => <Select id={id} value={type} onChange={(e) => setType(e.target.value as typeof type)}><option value="quiz">Quiz</option><option value="flashcards">Flashcards</option><option value="exercises">Practice exercises</option></Select>}</Field>
        <Field label="Count">{(id) => <Input id={id} type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-20" />}</Field>
        <Field label="Focus topic (optional)" className="min-w-48 flex-1">{(id) => <Input id={id} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. aliasing" />}</Field>
        <LevelSelect value={level} onChange={setLevel} />
        <Button type="submit" loading={pending} icon={<Layers className="size-4" />}>Generate</Button>
      </form>
      {error && <ErrorBox message={error} />}
      {result && result.items.length === 0 && <EmptyState title="Nothing generated" hint="The AI returned no items for this document. Try another focus topic or check that the PDF has readable text." />}
      {result?.type === "quiz" && <div className="space-y-3">{(result.items as QuizItem[]).map((q, i) => <QuizQuestion key={i} q={q} index={i} course={doc.course} />)}<p className="text-xs text-muted">Your answers update the topics you struggle with (see Progress).</p></div>}
      {result?.type === "flashcards" && <div className="grid gap-3 sm:grid-cols-2">{(result.items as CardItem[]).map((c, i) => <FlashCard key={i} c={c} />)}</div>}
      {result?.type === "exercises" && (
        <div className="space-y-3">
          {(result.items as ExItem[]).map((x, i) => (
            <Card key={i}>
              <div className="mb-2 flex gap-2"><Badge tone="accent">{x.difficulty}</Badge><Badge>{x.topic}</Badge>{x.page && <Badge>p. {x.page}</Badge>}</div>
              <Markdown>{x.prompt}</Markdown>
              {revealed.has(i) ? (
                <div className="mt-3 rounded-lg bg-surface-2 p-3"><Markdown>{x.solution}</Markdown></div>
              ) : (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setRevealed(new Set(revealed).add(i))}>Show solution</Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

interface Plan { overview: string; days: { date: string; sessions: { topic: string; minutes: number; activity: string }[] }[]; notes: string[] }

function PlanTab() {
  const toast = useToast();
  const [form, setForm] = useState({ goal: "", endDate: addDays(todayISO(), 14), minutesPerDay: 90, topics: "" });
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  async function run(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      setPlan(await api.post<Plan>("/study/plan", { ...form, topics: form.topics ? form.topics.split(",").map((t) => t.trim()).filter(Boolean) : undefined }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }
  async function saveAsTasks() {
    if (!plan) return;
    setSaving(true);
    try {
      const tasks = plan.days.flatMap((d) => d.sessions.map((s) => ({ title: `${s.topic}: ${s.activity}`.slice(0, 200), dueDate: d.date, category: "university", description: `${s.minutes} min study session (revision plan)` })));
      for (let i = 0; i < tasks.length; i += 50) await api.post("/tasks/bulk", { tasks: tasks.slice(i, i + 50), source: "study_plan" });
      toast("success", `Added ${tasks.length} study sessions to your tasks`);
    } catch (err) {
      toast("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-4">
      <form onSubmit={run} className="grid gap-3 sm:grid-cols-2">
        <Field label="Goal" className="sm:col-span-2">{(id) => <Input id={id} required value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder="e.g. Prepare for the DSP exam" />}</Field>
        <Field label="Until">{(id) => <Input id={id} type="date" required min={todayISO()} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />}</Field>
        <Field label="Minutes per day">{(id) => <Input id={id} type="number" min={15} max={720} value={form.minutesPerDay} onChange={(e) => setForm({ ...form, minutesPerDay: Number(e.target.value) })} />}</Field>
        <Field label="Topics (comma separated, optional)" className="sm:col-span-2" hint="Your university deadlines and weak topics from quizzes are included automatically.">{(id) => <Input id={id} value={form.topics} onChange={(e) => setForm({ ...form, topics: e.target.value })} />}</Field>
        <div><Button type="submit" loading={pending} icon={<CalendarRange className="size-4" />}>Create plan</Button></div>
      </form>
      {error && <ErrorBox message={error} />}
      {plan && (
        <Card title="Suggested revision plan" action={<Button size="sm" onClick={saveAsTasks} loading={saving}>Save sessions as tasks</Button>}>
          <p className="text-sm">{plan.overview}</p>
          <div className="mt-4 space-y-3">
            {plan.days.map((d) => (
              <div key={d.date}>
                <h4 className="text-sm font-semibold">{formatDate(d.date)}</h4>
                <ul className="mt-1 space-y-1">{d.sessions.map((s, i) => <li key={i} className="text-sm text-muted"><span className="font-medium text-text">{s.minutes} min</span> · {s.topic}: {s.activity}</li>)}</ul>
              </div>
            ))}
          </div>
          {plan.notes.length > 0 && <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted">{plan.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
          <p className="mt-3 text-xs text-muted">This is a suggestion. Nothing is added to your calendar unless you save it.</p>
        </Card>
      )}
    </div>
  );
}

interface Topic { id: string; name: string; course: string; attempts: number; correct: number; struggling: boolean }

function ProgressTab() {
  const { data, error, loading, reload } = useApi<{ topics: Topic[] }>("/study/topics");
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data?.topics.length) return <EmptyState icon={<TrendingUp className="size-6" />} title="No progress recorded yet" hint="Answer quiz questions and GhostMate tracks which topics you struggle with." />;
  return (
    <div className="space-y-2">
      {data.topics.map((t) => {
        const pct = Math.round((t.correct / Math.max(1, t.attempts)) * 100);
        return (
          <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">{t.name} {t.struggling && <Badge tone="warning">needs work</Badge>}</div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className={cx("h-full rounded-full", pct >= 60 ? "bg-success" : "bg-warning")} style={{ width: `${pct}%` }} /></div>
            </div>
            <span className="w-20 text-right text-xs text-muted">{t.correct}/{t.attempts} correct</span>
            <IconButton label={`Remove ${t.name}`} onClick={async () => { await api.delete(`/study/topics/${t.id}`); void reload(); }}><Trash2 className="size-4" /></IconButton>
          </div>
        );
      })}
    </div>
  );
}

export function StudyPage() {
  const docsQ = useApi<{ documents: Doc[] }>("/documents?kind=lecture");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("ask");
  const [uploading, setUploading] = useState(false);
  const docs = docsQ.data?.documents ?? [];
  const selected = docs.find((d) => d.id === selectedId) ?? docs[0] ?? null;
  const needsDoc = tab === "summary" || tab === "practice";

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Study</h1>
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setUploading(true)}>Upload</Button>
        </div>
        <div className="rounded-xl border border-border bg-surface p-2">
          {docsQ.loading && !docsQ.data ? <Spinner /> : docsQ.error ? <ErrorBox message={docsQ.error} onRetry={docsQ.reload} /> : docs.length === 0 ? (
            <EmptyState icon={<BookOpen className="size-6" />} title="No lecture materials yet" hint="Upload lecture PDFs to ask questions, summarize and practise." action={<Button size="sm" onClick={() => setUploading(true)}>Upload a PDF</Button>} />
          ) : (
            docs.map((d) => <DocItem key={d.id} doc={d} active={d.id === selected?.id} onClick={() => setSelectedId(d.id)} />)
          )}
        </div>
      </aside>
      <section className="min-w-0 space-y-4">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "ask", label: "Ask", icon: <CircleHelp className="size-3.5" /> },
            { id: "summary", label: "Summary", icon: <BookOpen className="size-3.5" /> },
            { id: "explain", label: "Explain", icon: <BrainCircuit className="size-3.5" /> },
            { id: "practice", label: "Quiz & cards", icon: <ListChecks className="size-3.5" /> },
            { id: "plan", label: "Revision plan", icon: <CalendarRange className="size-3.5" /> },
            { id: "progress", label: "Progress", icon: <TrendingUp className="size-3.5" /> },
          ]}
        />
        {selected?.status === "needs_ocr" && (tab === "ask" || needsDoc) && <Notice>{selected.statusMessage}</Notice>}
        {selected && selected.status !== "needs_ocr" && selected.emptyPages.length > 0 && needsDoc && <Notice>{selected.statusMessage}</Notice>}
        {needsDoc && !selected ? (
          <EmptyState title="Upload a lecture PDF first" />
        ) : tab === "ask" ? (
          docs.length ? <AskTab docs={docs} selected={selected} /> : <EmptyState title="Upload a lecture PDF to ask questions about it" />
        ) : tab === "summary" ? (
          <SummaryTab key={selected!.id} doc={selected!} onUpdated={docsQ.reload} />
        ) : tab === "explain" ? (
          <ExplainTab selected={selected} />
        ) : tab === "practice" ? (
          <PracticeTab key={selected!.id} doc={selected!} />
        ) : tab === "plan" ? (
          <PlanTab />
        ) : (
          <ProgressTab />
        )}
      </section>
      <UploadModal open={uploading} onClose={() => setUploading(false)} defaultKind="lecture" onUploaded={(d) => { void docsQ.reload(); setSelectedId(d.id); }} />
    </div>
  );
}
