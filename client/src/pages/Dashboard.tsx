import { ArrowRight, CalendarClock, MapPin, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { TaskModal, TaskRow, useToggleTask } from "../components/tasks";
import { useToast } from "../components/toast";
import { Badge, Button, Card, EmptyState, ErrorBox, Input, Markdown, Notice, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, formatDateTime } from "../lib/dates";
import { useApi } from "../lib/hooks";
import type { CalEvent, Task } from "../lib/types";

interface DashboardData {
  today: string;
  weekday: string;
  topPriorities: Task[];
  dueToday: Task[];
  completedToday: number;
  overdue: Task[];
  upcoming: Task[];
  recent: Task[];
  inProgress: Task[];
  eventsToday: CalEvent[];
  eventsUpcoming: CalEvent[];
  applications: Record<string, number>;
  followUps: { id: string; company: string; title: string; status: string; followUpDate: string }[];
  briefing: { content: string; generatedAt: string } | null;
}

const APP_ORDER = ["saved", "preparing", "applied", "interview", "offer", "rejected"];

function QuickAdd({ onAdded }: { onAdded: () => void }) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const toast = useToast();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setPending(true);
    try {
      const res = await api.post<{ task: Task }>("/tasks/quick", { text });
      const t = res.task;
      toast("success", `Added "${t.title}"${t.dueDate ? ` for ${formatDate(t.dueDate)}${t.dueTime ? ` ${t.dueTime}` : ""}` : ""}${t.reminderAt ? " with a reminder" : ""}`);
      setText("");
      onAdded();
    } catch (err) {
      toast("error", errorMessage(err));
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex gap-2">
      <label htmlFor="quick-add" className="sr-only">Quick add a task</label>
      <Input
        id="quick-add"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='Quick add: "Remind me to email my professor tomorrow at 10 !high"'
        className="h-11"
      />
      <Button type="submit" loading={pending} icon={<Plus className="size-4" />} className="h-11">
        Add
      </Button>
    </form>
  );
}

function EventLine({ e, showDate }: { e: CalEvent; showDate?: boolean }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-purple/30 bg-purple-soft/40 px-3 py-2">
      <div className="w-14 shrink-0 text-xs font-semibold text-purple">{showDate ? formatDate(e.date, { weekday: "short", day: "numeric" }) : e.startTime ?? "All day"}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{e.title}</div>
        <div className="flex flex-wrap gap-x-2 text-xs text-muted">
          {showDate && e.startTime && <span>{e.startTime}{e.endTime && `–${e.endTime}`}</span>}
          {!showDate && e.endTime && <span>until {e.endTime}</span>}
          {e.location && <span className="inline-flex items-center gap-0.5"><MapPin className="size-3" />{e.location}</span>}
        </div>
      </div>
    </li>
  );
}

export function DashboardPage() {
  const { user, ai } = useAuth();
  const { data, error, loading, reload } = useApi<DashboardData>("/dashboard");
  const [editing, setEditing] = useState<Task | null>(null);
  const [briefingPending, setBriefingPending] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const toggle = useToggleTask(reload);

  async function generateBriefing() {
    setBriefingPending(true);
    setBriefingError(null);
    try {
      await api.post("/dashboard/briefing");
      await reload();
    } catch (err) {
      setBriefingError(errorMessage(err));
    } finally {
      setBriefingPending(false);
    }
  }

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";
  const totalToday = data.dueToday.length + data.completedToday;
  const appTotal = Object.values(data.applications).reduce((a, b) => a + b, 0);
  const rowProps = { onToggle: toggle, onOpen: setEditing, today: data.today };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{greeting}, {user?.name?.split(" ")[0]}</h1>
        <p className="text-sm text-muted">
          {data.weekday}, {formatDate(data.today, { day: "numeric", month: "long", year: "numeric" })}
          {totalToday > 0 && ` · ${data.completedToday} of ${totalToday} tasks due today done`}
        </p>
      </div>
      <QuickAdd onAdded={reload} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card
            title={<span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-accent" /> Daily briefing</span>}
            action={
              <Button size="sm" variant="outline" onClick={generateBriefing} loading={briefingPending} disabled={!ai?.configured} icon={<RefreshCw className="size-3.5" />}>
                {data.briefing ? "Refresh" : "Generate"}
              </Button>
            }
          >
            {briefingError && <div className="mb-3"><ErrorBox message={briefingError} /></div>}
            {data.briefing ? (
              <>
                <Markdown>{data.briefing.content}</Markdown>
                <p className="mt-3 text-xs text-muted">Generated {formatDateTime(data.briefing.generatedAt)} from your saved tasks, events and applications.</p>
              </>
            ) : ai?.configured ? (
              <p className="text-sm text-muted">Generate a short briefing based on your actual tasks, calendar and applications for today.</p>
            ) : (
              <Notice>AI is not configured, so no briefing can be generated. Everything below comes straight from your database.</Notice>
            )}
          </Card>

          <Card title="Today" action={<Link to="/tasks" className="text-xs font-medium text-accent hover:underline">Open calendar</Link>}>
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Confirmed events</h3>
                {data.eventsToday.length ? (
                  <ul className="space-y-2">{data.eventsToday.map((e) => <EventLine key={e.id + e.date} e={e} />)}</ul>
                ) : (
                  <p className="text-sm text-muted">No events in your calendar today.</p>
                )}
              </div>
              {data.overdue.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-danger">Overdue ({data.overdue.length})</h3>
                  <div className="space-y-2">{data.overdue.map((t) => <TaskRow key={t.id} task={t} {...rowProps} />)}</div>
                </div>
              )}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Due today</h3>
                {data.dueToday.length ? (
                  <div className="space-y-2">{data.dueToday.map((t) => <TaskRow key={t.id} task={t} {...rowProps} />)}</div>
                ) : (
                  <p className="text-sm text-muted">Nothing due today.</p>
                )}
              </div>
            </div>
          </Card>

          <Card title="Next 7 days">
            {data.upcoming.length === 0 && data.eventsUpcoming.length === 0 ? (
              <EmptyState icon={<CalendarClock className="size-6" />} title="No upcoming deadlines" hint="Tasks with due dates in the next week will appear here." />
            ) : (
              <div className="space-y-4">
                {data.eventsUpcoming.length > 0 && <ul className="space-y-2">{data.eventsUpcoming.slice(0, 6).map((e) => <EventLine key={e.id + e.date} e={e} showDate />)}</ul>}
                <div className="space-y-2">{data.upcoming.map((t) => <TaskRow key={t.id} task={t} {...rowProps} />)}</div>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Top priorities">
            {data.topPriorities.length ? (
              <div className="space-y-2">{data.topPriorities.map((t) => <TaskRow key={t.id} task={t} compact {...rowProps} />)}</div>
            ) : (
              <EmptyState title="No open tasks" hint="Use quick add above or ask the assistant." />
            )}
          </Card>

          <Card title="Job applications" action={<Link to="/jobs" className="text-xs font-medium text-accent hover:underline">Manage</Link>}>
            {appTotal === 0 ? (
              <p className="text-sm text-muted">No applications tracked yet.</p>
            ) : (
              <dl className="grid grid-cols-3 gap-2">
                {APP_ORDER.filter((s) => data.applications[s]).map((s) => (
                  <div key={s} className="rounded-lg bg-surface-2 px-2 py-2 text-center">
                    <dt className="text-[11px] uppercase tracking-wide text-muted">{s}</dt>
                    <dd className="text-lg font-semibold">{data.applications[s]}</dd>
                  </div>
                ))}
              </dl>
            )}
            {data.followUps.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Follow-ups this week</h3>
                {data.followUps.map((a) => (
                  <Link key={a.id} to="/jobs" className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
                    <span className="truncate">{a.company}: {a.title}</span>
                    <Badge tone={a.followUpDate <= data.today ? "warning" : "neutral"}>{formatDate(a.followUpDate, { day: "numeric", month: "short" })}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {data.inProgress.length > 0 && (
            <Card title="Unfinished work">
              <div className="space-y-2">{data.inProgress.map((t) => <TaskRow key={t.id} task={t} compact {...rowProps} />)}</div>
            </Card>
          )}

          <Card title="Recently added">
            {data.recent.length ? (
              <ul className="space-y-1">
                {data.recent.map((t) => (
                  <li key={t.id}>
                    <button onClick={() => setEditing(t)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2">
                      <span className="truncate">{t.title}</span>
                      <span className="shrink-0 text-xs text-muted">{t.source.replace("_", " ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nothing yet.</p>
            )}
          </Card>

          <Link to="/assistant" className="flex items-center justify-between rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm font-medium text-accent hover:brightness-110">
            Ask GhostMate to plan your day <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
      <TaskModal open={Boolean(editing)} task={editing} onClose={() => setEditing(null)} onSaved={reload} />
    </div>
  );
}
