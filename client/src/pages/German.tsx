import { Dumbbell, Languages, Mail, MessageCircle, Plus, Send, SpellCheck, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useToast } from "../components/toast";
import { Badge, Button, Card, CopyButton, cx, EmptyState, ErrorBox, Field, IconButton, Input, Select, Spinner, Tabs, Textarea } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useApi } from "../lib/hooks";
import type { ChatMessage, Conversation, User } from "../lib/types";

type Tab = "talk" | "check" | "draft" | "mistakes";
interface Correction { original: string; corrected: string; explanation: string; category: string }

function Corrections({ items, natural }: { items: Correction[]; natural?: string | null }) {
  if (!items.length && !natural) return <p className="mt-1 text-right text-[11px] text-success">No mistakes found ✓</p>;
  return (
    <div className="mt-1.5 space-y-1.5 rounded-lg border border-warning/30 bg-warning-soft/50 p-2.5 text-xs">
      {items.map((c, i) => (
        <div key={i}>
          <span className="text-danger line-through">{c.original}</span> → <span className="font-medium text-success">{c.corrected}</span>
          <p className="mt-0.5 text-muted">{c.explanation} <Badge>{c.category}</Badge></p>
        </div>
      ))}
      {natural && <p className="text-muted"><span className="font-medium text-text">More natural:</span> {natural}</p>}
    </div>
  );
}

function LevelBar() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  async function update(patch: Partial<User["german"]>) {
    try {
      const res = await api.patch<{ user: User }>("/settings", { german: patch });
      setUser(res.user);
    } catch (err) {
      toast("error", errorMessage(err));
    }
  }
  if (!user) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="text-muted" htmlFor="lvl">Level</label>
      <Select id="lvl" className="h-8 w-auto" value={user.german.level} onChange={(e) => void update({ level: e.target.value as User["german"]["level"] })}>
        {["A1", "A2", "B1", "B2", "C1", "C2"].map((l) => <option key={l}>{l}</option>)}
      </Select>
      <label className="ml-2 text-muted" htmlFor="xl">Explanations in</label>
      <Select id="xl" className="h-8 w-auto" value={user.german.explanationLanguage} onChange={(e) => void update({ explanationLanguage: e.target.value as User["german"]["explanationLanguage"] })}>
        <option value="en">English</option>
        <option value="fr">Français</option>
        <option value="tn">Tunisian Arabic (Derja)</option>
      </Select>
    </div>
  );
}

function TalkTab() {
  const toast = useToast();
  const scenarios = useApi<{ scenarios: { id: string; description: string }[] }>("/german/scenarios");
  const sessions = useApi<{ sessions: Conversation[] }>("/german/sessions");
  const [active, setActive] = useState<Conversation | null>(null);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState<Set<number>>(new Set());
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [active?.messages.length, pending]);

  async function start(scenario: string) {
    try {
      const res = await api.post<{ session: Conversation }>("/german/sessions", { scenario });
      setActive(res.session);
      void sessions.reload();
    } catch (err) {
      toast("error", errorMessage(err));
    }
  }
  async function open(id: string) {
    const res = await api.get<{ session: Conversation }>(`/german/sessions/${id}`);
    setActive(res.session);
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!active || !text.trim()) return;
    setPending(true);
    setError(null);
    const msg = text;
    setText("");
    setActive({ ...active, messages: [...active.messages, { role: "user", content: msg }] });
    try {
      const res = await api.post<{ session: Conversation }>(`/german/sessions/${active.id}/messages`, { text: msg });
      setActive(res.session);
    } catch (err) {
      setError(errorMessage(err));
      setText(msg);
      setActive(active);
    } finally {
      setPending(false);
    }
  }

  if (!active) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Start a role-play</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {(scenarios.data?.scenarios ?? []).map((s) => (
              <button key={s.id} onClick={() => void start(s.id)} className="rounded-xl border border-border bg-surface p-3 text-left transition hover:border-accent">
                <div className="text-sm font-medium capitalize">{s.id === "auslaenderbehoerde" ? "Ausländerbehörde" : s.id === "smalltalk" ? "Small talk" : s.id}</div>
                <div className="mt-0.5 text-xs text-muted">{s.description}</div>
              </button>
            ))}
          </div>
        </div>
        {sessions.data?.sessions.length ? (
          <div>
            <h2 className="mb-2 text-sm font-semibold">Continue</h2>
            <ul className="space-y-1">
              {sessions.data.sessions.map((s) => (
                <li key={s.id} className="flex items-center rounded-lg hover:bg-surface-2">
                  <button className="flex-1 px-3 py-2 text-left text-sm" onClick={() => void open(s.id)}>{s.title}</button>
                  <IconButton label={`Delete ${s.title}`} onClick={async () => { await api.delete(`/german/sessions/${s.id}`); void sessions.reload(); }}><Trash2 className="size-4" /></IconButton>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-16rem)] min-h-96 flex-col rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-sm font-semibold">{active.title}</span>
        <Button size="sm" variant="ghost" onClick={() => setActive(null)}>End</Button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {active.messages.length === 0 && <p className="text-center text-sm text-muted">Say hello in German to begin. Mistakes are corrected under your messages.</p>}
        {active.messages.map((m: ChatMessage, i) => {
          const meta = (m.meta ?? {}) as { corrections?: Correction[]; naturalAlternative?: string | null; translation?: string; tip?: string | null };
          return m.role === "user" ? (
            <div key={i} className="ml-auto max-w-[85%]">
              <div className="rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-accent-text">{m.content}</div>
              {meta.corrections && <Corrections items={meta.corrections} natural={meta.naturalAlternative} />}
            </div>
          ) : (
            <div key={i} className="max-w-[85%]">
              <div className="rounded-2xl rounded-tl-md border border-border bg-surface-2 px-3.5 py-2 text-sm">{m.content}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                {meta.translation && (
                  <button className="text-accent hover:underline" onClick={() => setShowTranslation((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>
                    {showTranslation.has(i) ? "Hide translation" : "Translate"}
                  </button>
                )}
              </div>
              {showTranslation.has(i) && <p className="mt-1 text-xs text-muted">{meta.translation}</p>}
              {meta.tip && <p className="mt-1 text-xs text-muted">💡 {meta.tip}</p>}
            </div>
          );
        })}
        {pending && <p className="text-sm text-muted">…</p>}
        {error && <ErrorBox message={error} />}
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
        <label htmlFor="de-input" className="sr-only">Your message in German</label>
        <Input id="de-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Schreib auf Deutsch…" maxLength={2000} />
        <Button type="submit" loading={pending} disabled={!text.trim()} aria-label="Send" icon={<Send className="size-4" />} />
      </form>
    </div>
  );
}

function CheckTab() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ corrected: string; corrections: Correction[]; naturalVersion: string; overall: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function run(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      setResult(await api.post("/german/check", { text }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-4">
      <form onSubmit={run} className="space-y-3">
        <Field label="Your German text">{(id) => <Textarea id={id} required rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ich wohne seit drei Monaten in Köln und ich studiere an der TH…" />}</Field>
        <Button type="submit" loading={pending} icon={<SpellCheck className="size-4" />}>Check</Button>
      </form>
      {error && <ErrorBox message={error} />}
      {result && (
        <Card>
          <p className="text-sm">{result.overall}</p>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Corrected</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm">{result.corrected}</p>
          <div className="mt-3"><Corrections items={result.corrections} /></div>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">How a native speaker might write it</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm">{result.naturalVersion}</p>
        </Card>
      )}
    </div>
  );
}

function DraftTab() {
  const [form, setForm] = useState({ kind: "email", recipient: "", situation: "", formality: "formal", points: "" });
  const [result, setResult] = useState<{ subject: string | null; german: string; gloss: string; notes: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function run(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      setResult(await api.post("/german/draft", { ...form, points: form.points || undefined }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-4">
      <form onSubmit={run} className="grid gap-3 sm:grid-cols-2">
        <Field label="Type">{(id) => <Select id={id} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="email">Email</option><option value="message">Short message</option><option value="letter">Letter</option></Select>}</Field>
        <Field label="Tone">{(id) => <Select id={id} value={form.formality} onChange={(e) => setForm({ ...form, formality: e.target.value })}><option value="formal">Formal (Sie)</option><option value="informal">Informal (du)</option></Select>}</Field>
        <Field label="To" className="sm:col-span-2">{(id) => <Input id={id} required value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} placeholder="e.g. my landlord Herr Becker, Prof. Schmidt, the Studierendensekretariat" />}</Field>
        <Field label="Situation" className="sm:col-span-2">{(id) => <Textarea id={id} required minLength={5} value={form.situation} onChange={(e) => setForm({ ...form, situation: e.target.value })} placeholder="The heating in my flat has not worked since Monday…" />}</Field>
        <Field label="Points to include (optional)" className="sm:col-span-2">{(id) => <Textarea id={id} value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} />}</Field>
        <div><Button type="submit" loading={pending} icon={<Mail className="size-4" />}>Draft</Button></div>
      </form>
      {error && <ErrorBox message={error} />}
      {result && (
        <Card title="Draft (copy and send it yourself)" action={<CopyButton text={(result.subject ? `Betreff: ${result.subject}\n\n` : "") + result.german} />}>
          {result.subject && <p className="mb-2 text-sm"><span className="font-medium">Betreff:</span> {result.subject}</p>}
          <p className="whitespace-pre-wrap text-sm">{result.german}</p>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-accent">Translation</summary>
            <p className="mt-2 whitespace-pre-wrap text-muted">{result.gloss}</p>
          </details>
          {result.notes.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">{result.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </Card>
      )}
    </div>
  );
}

interface Mistake { id: string; category: string; example: string; correction: string; explanation: string; count: number }
interface Exercise { category: string; instruction: string; prompt: string; answer: string; explanation: string }

function MistakesTab() {
  const { data, loading, error, reload } = useApi<{ mistakes: Mistake[] }>("/german/mistakes");
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [pending, setPending] = useState(false);
  const [exError, setExError] = useState<string | null>(null);
  async function generate() {
    setPending(true);
    setExError(null);
    try {
      const res = await api.post<{ exercises: Exercise[] }>("/german/exercises", { count: 8 });
      setExercises(res.exercises);
      setAnswers({});
      setRevealed(new Set());
    } catch (err) {
      setExError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Recurring mistakes">
        {loading && !data ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> : !data?.mistakes.length ? (
          <EmptyState title="No mistakes recorded yet" hint="Practise conversations or check texts; recurring errors are saved here." />
        ) : (
          <ul className="space-y-2">
            {data.mistakes.map((m) => (
              <li key={m.id} className="flex items-start gap-2 rounded-lg border border-border p-2.5">
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex items-center gap-2 font-medium">{m.category} <Badge tone={m.count >= 3 ? "warning" : "neutral"}>{m.count}×</Badge></div>
                  <p className="mt-0.5 text-xs"><span className="text-danger line-through">{m.example}</span> → <span className="text-success">{m.correction}</span></p>
                  <p className="mt-0.5 text-xs text-muted">{m.explanation}</p>
                </div>
                <IconButton label={`Forget ${m.category}`} onClick={async () => { await api.delete(`/german/mistakes/${m.id}`); void reload(); }}><Trash2 className="size-4" /></IconButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Personalised exercises" action={<Button size="sm" onClick={generate} loading={pending} icon={<Dumbbell className="size-4" />}>{exercises ? "New set" : "Generate"}</Button>}>
        {exError && <ErrorBox message={exError} />}
        {!exercises ? (
          <p className="text-sm text-muted">Exercises target your most frequent mistakes.</p>
        ) : (
          <ol className="space-y-3">
            {exercises.map((x, i) => (
              <li key={i} className="rounded-lg border border-border p-3 text-sm">
                <p className="text-xs text-muted">{x.instruction}</p>
                <p className="mt-1 font-medium">{x.prompt}</p>
                <div className="mt-2 flex gap-2">
                  <Input aria-label={`Answer ${i + 1}`} className="h-8" value={answers[i] ?? ""} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} />
                  <Button size="sm" variant="outline" onClick={() => setRevealed(new Set(revealed).add(i))}>Check</Button>
                </div>
                {revealed.has(i) && (
                  <p className={cx("mt-2 text-xs", (answers[i] ?? "").trim().toLowerCase() === x.answer.trim().toLowerCase() ? "text-success" : "text-muted")}>
                    Answer: <span className="font-medium text-text">{x.answer}</span>. {x.explanation}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

export function GermanPage() {
  const [tab, setTab] = useState<Tab>("talk");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight"><Languages className="size-5 text-accent" /> German Coach</h1>
          <p className="text-sm text-muted">Practise real situations, get corrections and drill your recurring mistakes.</p>
        </div>
        <LevelBar />
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "talk", label: "Conversation", icon: <MessageCircle className="size-3.5" /> },
          { id: "check", label: "Check my text", icon: <SpellCheck className="size-3.5" /> },
          { id: "draft", label: "Write email", icon: <Mail className="size-3.5" /> },
          { id: "mistakes", label: "Mistakes & exercises", icon: <Plus className="size-3.5" /> },
        ]}
      />
      {tab === "talk" ? <TalkTab /> : tab === "check" ? <CheckTab /> : tab === "draft" ? <DraftTab /> : <MistakesTab />}
    </div>
  );
}
