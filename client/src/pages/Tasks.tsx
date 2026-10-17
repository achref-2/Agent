import { CalendarDays, ChevronLeft, ChevronRight, ListTodo, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { CATEGORIES, EventModal, PRIORITIES, STATUSES, TaskModal, TaskRow, useToggleTask } from "../components/tasks";
import { Button, cx, EmptyState, ErrorBox, IconButton, Input, Select, Spinner, Tabs } from "../components/ui";
import { qs } from "../lib/api";
import { addDays, formatDate, parseISODate, startOfWeek, toISODate, todayISO } from "../lib/dates";
import { useApi } from "../lib/hooks";
import type { CalEvent, Task } from "../lib/types";

type View = "month" | "week" | "day" | "list";
type Panel = "today" | "week" | "month";

function rangeFor(view: View, cursor: string) {
  if (view === "day") return { from: cursor, to: cursor };
  if (view === "week") {
    const from = startOfWeek(cursor);
    return { from, to: addDays(from, 6) };
  }
  const d = parseISODate(cursor);
  const first = toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
  const last = toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  return { from: startOfWeek(first), to: addDays(startOfWeek(last), 6) };
}

function Chip({ label, kind, done, onClick, time, className }: { label: string; kind: "task" | "event"; done?: boolean; onClick: () => void; time?: string | null; className?: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cx(
        "block w-full truncate rounded-md border px-1.5 py-0.5 text-left text-[11px] font-medium transition hover:brightness-125",
        kind === "event" ? "border-purple/50 bg-purple-soft text-purple" : "border-cyan/50 bg-transparent text-cyan",
        done && "line-through opacity-50",
        className,
      )}
    >
      {time && <span className="mr-1 opacity-80">{time}</span>}
      {label}
    </button>
  );
}

export function TasksPage() {
  const today = todayISO();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(today);
  const [selected, setSelected] = useState(today);
  const [panel, setPanel] = useState<Panel>("today");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newTask, setNewTask] = useState<string | null>(null); // due date for a new task
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);
  const [newEvent, setNewEvent] = useState<string | null>(null);
  const [filters, setFilters] = useState({ search: "", status: "open", category: "", priority: "" });

  const range = rangeFor(view === "list" ? "month" : view, cursor);
  const tasksQ = useApi<{ tasks: Task[]; today: string }>(`/tasks${qs({ status: "all", sort: "due", limit: 200 })}`);
  const listQ = useApi<{ tasks: Task[] }>(view === "list" ? `/tasks${qs({ ...filters, sort: "urgency", limit: 200 })}` : null);
  const rangeEvents = useApi<{ events: CalEvent[] }>(`/events${qs(range)}`);
  const reloadAll = () => {
    void tasksQ.reload();
    void rangeEvents.reload();
    if (view === "list") void listQ.reload();
  };
  const toggle = useToggleTask(reloadAll);

  const tasks = tasksQ.data?.tasks ?? [];
  const byDate = useMemo(() => {
    const m = new Map<string, { tasks: Task[]; events: CalEvent[] }>();
    const get = (d: string) => m.get(d) ?? (m.set(d, { tasks: [], events: [] }), m.get(d)!);
    for (const t of tasks) if (t.dueDate) get(t.dueDate).tasks.push(t);
    for (const e of rangeEvents.data?.events ?? []) get(e.date).events.push(e);
    return m;
  }, [tasks, rangeEvents.data]);

  function shift(dir: 1 | -1) {
    if (view === "day") setCursor(addDays(cursor, dir));
    else if (view === "week") setCursor(addDays(cursor, 7 * dir));
    else {
      const d = parseISODate(cursor);
      setCursor(toISODate(new Date(d.getFullYear(), d.getMonth() + dir, 1)));
    }
  }

  const title =
    view === "day"
      ? formatDate(cursor, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : view === "week"
        ? `${formatDate(range.from, { day: "numeric", month: "short" })} – ${formatDate(range.to, { day: "numeric", month: "short", year: "numeric" })}`
        : formatDate(cursor, { month: "long", year: "numeric" });

  // Side panel
  const panelEnd = panel === "today" ? today : panel === "week" ? addDays(today, 6) : addDays(today, 30);
  const panelTasks = tasks.filter((t) => t.dueDate && t.dueDate <= panelEnd && (t.dueDate >= today || t.status === "todo" || t.status === "in_progress") && t.status !== "cancelled");
  const panelDone = panelTasks.filter((t) => t.status === "done").length;
  const groups: { label: string; sub: string; items: Task[] }[] = [
    { label: "Overdue", sub: "", items: panelTasks.filter((t) => t.dueDate! < today && t.status !== "done") },
    { label: "Today", sub: formatDate(today, { weekday: "long", day: "numeric", month: "short" }), items: panelTasks.filter((t) => t.dueDate === today) },
    { label: "Tomorrow", sub: formatDate(addDays(today, 1), { weekday: "long", day: "numeric", month: "short" }), items: panelTasks.filter((t) => t.dueDate === addDays(today, 1)) },
    { label: panel === "month" ? "Later" : "This week", sub: "", items: panelTasks.filter((t) => t.dueDate! > addDays(today, 1)) },
  ].filter((g) => g.items.length);
  const undated = tasks.filter((t) => !t.dueDate && (t.status === "todo" || t.status === "in_progress"));

  const days: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) days.push(d);
  const currentMonth = parseISODate(cursor).getMonth();

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Tasks &amp; Calendar</h1>
            <p className="text-sm text-muted">{formatDate(today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<CalendarDays className="size-4" />} onClick={() => setNewEvent(selected)}>Event</Button>
            <Button icon={<Plus className="size-4" />} onClick={() => setNewTask(view === "list" ? "" : selected)}>Task</Button>
            <Tabs<View>
              label="Calendar view"
              value={view}
              onChange={setView}
              tabs={[
                { id: "month", label: "Month" },
                { id: "week", label: "Week" },
                { id: "day", label: "Day" },
                { id: "list", label: "List", icon: <ListTodo className="size-3.5" /> },
              ]}
            />
          </div>
        </div>

        {(tasksQ.error || rangeEvents.error) && <ErrorBox message={(tasksQ.error || rangeEvents.error)!} onRetry={reloadAll} />}

        {view === "list" ? (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <Input aria-label="Search tasks" placeholder="Search tasks" className="pl-9" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
              </div>
              <Select aria-label="Filter by status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                <option value="open">Open</option>
                <option value="all">All</option>
                {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </Select>
              <Select aria-label="Category" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
                <option value="">All categories</option>
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
              <Select aria-label="Priority" value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })}>
                <option value="">Any priority</option>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </div>
            {listQ.loading && !listQ.data ? (
              <Spinner />
            ) : listQ.error ? (
              <ErrorBox message={listQ.error} onRetry={listQ.reload} />
            ) : listQ.data?.tasks.length ? (
              <div className="space-y-2">{listQ.data.tasks.map((t) => <TaskRow key={t.id} task={t} onToggle={toggle} onOpen={setEditingTask} today={today} />)}</div>
            ) : (
              <EmptyState title="No tasks match" hint="Change the filters or create a task." />
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between">
              <IconButton label="Previous" onClick={() => shift(-1)}><ChevronLeft className="size-5" /></IconButton>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{title}</span>
                {!days.includes(today) || view === "day" ? (
                  <Button size="sm" variant="ghost" onClick={() => { setCursor(today); setSelected(today); }}>Today</Button>
                ) : null}
              </div>
              <IconButton label="Next" onClick={() => shift(1)}><ChevronRight className="size-5" /></IconButton>
            </div>

            {view === "day" ? (
              <DayList date={cursor} data={byDate.get(cursor)} onTask={setEditingTask} onEvent={setEditingEvent} onToggle={toggle} today={today} />
            ) : (
              <div className="overflow-x-auto">
                <div className={cx("grid grid-cols-7 gap-1.5", view === "month" ? "gap-1 sm:min-w-[640px] sm:gap-1.5" : "min-w-[720px]")}>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                    <div key={d} className="pb-1 text-center text-xs font-semibold text-muted">{d}</div>
                  ))}
                  {days.map((d) => {
                    const items = byDate.get(d);
                    const inMonth = view === "week" || parseISODate(d).getMonth() === currentMonth;
                    const max = view === "month" ? 3 : 12;
                    const all = [
                      ...(items?.events ?? []).map((e) => ({ kind: "event" as const, e, key: `e${e.id}`, time: e.startTime })),
                      ...(items?.tasks ?? []).map((t) => ({ kind: "task" as const, t, key: `t${t.id}`, time: t.dueTime })),
                    ].sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));
                    return (
                      <div
                        key={d}
                        onClick={() => {
                          setSelected(d);
                          // On phones the month grid only shows dots, so a tap opens that day's list.
                          if (view === "month" && window.matchMedia("(max-width: 639px)").matches) { setCursor(d); setView("day"); }
                        }}
                        onDoubleClick={() => setNewTask(d)}
                        className={cx(
                          "group flex flex-col gap-1 rounded-lg border p-1.5 text-left transition",
                          view === "month" ? "min-h-14 p-1 sm:min-h-24 sm:p-1.5" : "min-h-64",
                          inMonth ? "border-border bg-surface-2/60" : "border-transparent bg-surface-2/20 opacity-50",
                          d === selected && "ring-2 ring-accent",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className={cx("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", d === today ? "bg-accent text-accent-text" : "text-text")}>{parseISODate(d).getDate()}</span>
                          <button aria-label={`Add task on ${formatDate(d)}`} onClick={(ev) => { ev.stopPropagation(); setNewTask(d); }} className={cx("rounded p-0.5 text-muted opacity-0 hover:text-text focus:opacity-100 group-hover:opacity-100", view === "month" && "hidden sm:block")}>
                            <Plus className="size-3.5" />
                          </button>
                        </div>
                        {view === "month" && all.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden="true">
                            {all.slice(0, 4).map((it) => (
                              <span key={it.key} className={cx("size-1.5 rounded-full", it.kind === "event" ? "bg-purple" : "bg-cyan")} />
                            ))}
                          </div>
                        )}
                        {all.slice(0, max).map((it) =>
                          it.kind === "event" ? (
                            <Chip key={it.key} kind="event" label={it.e.title} time={it.e.startTime} onClick={() => setEditingEvent(it.e)} className={view === "month" ? "hidden sm:block" : undefined} />
                          ) : (
                            <Chip key={it.key} kind="task" label={it.t.title} time={it.t.dueTime} done={it.t.status === "done"} onClick={() => setEditingTask(it.t)} className={view === "month" ? "hidden sm:block" : undefined} />
                          ),
                        )}
                        {all.length > max && (
                          <button onClick={() => { setCursor(d); setView("day"); }} className={cx("text-left text-[11px] text-muted hover:text-text", view === "month" && "hidden sm:block")}>+{all.length - max} more</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <p className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-cyan" /> Task deadline</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-purple" /> Confirmed event</span>
              <span className="hidden sm:inline">Double-click a day to add a task.</span>
              <span className="sm:hidden">Tap a day to see its tasks and events.</span>
            </p>
          </div>
        )}
      </div>

      <aside className="space-y-4 rounded-xl border border-border bg-surface p-4 xl:sticky xl:top-0 xl:max-h-[calc(100dvh-8rem)] xl:overflow-y-auto">
        <div>
          <h2 className="text-lg font-semibold text-accent">Todos</h2>
          <p className="text-xs text-muted">Your upcoming tasks</p>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs"><span className="text-muted">Progress ({panel})</span><span className="font-semibold">{panelDone}/{panelTasks.length}</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={panelDone} aria-valuemax={panelTasks.length}>
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${panelTasks.length ? (panelDone / panelTasks.length) * 100 : 0}%` }} />
          </div>
        </div>
        <Tabs<Panel> label="Todo range" value={panel} onChange={setPanel} className="w-full justify-between" tabs={[{ id: "today", label: "Today" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }]} />
        {tasksQ.loading && !tasksQ.data ? (
          <Spinner />
        ) : groups.length === 0 ? (
          <EmptyState title="Nothing scheduled" hint="Tasks with due dates in this period show up here." />
        ) : (
          groups.map((g) => (
            <div key={g.label}>
              <h3 className={cx("text-sm font-semibold", g.label === "Overdue" && "text-danger")}>{g.label}</h3>
              {g.sub && <p className="mb-1.5 text-xs text-muted">{g.sub}</p>}
              <div className="mt-1.5 space-y-2">{g.items.map((t) => <TaskRow key={t.id} task={t} onToggle={toggle} onOpen={setEditingTask} today={today} compact />)}</div>
            </div>
          ))
        )}
        {undated.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold">No due date</h3>
            <div className="mt-1.5 space-y-2">{undated.slice(0, 8).map((t) => <TaskRow key={t.id} task={t} onToggle={toggle} onOpen={setEditingTask} today={today} compact />)}</div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
          <Button variant="outline" size="sm" className="border-dashed text-cyan" onClick={() => setNewTask(today)}>+ Create task</Button>
          <Button variant="outline" size="sm" className="border-dashed text-purple" onClick={() => setNewEvent(today)}>+ Create event</Button>
        </div>
      </aside>

      <TaskModal open={Boolean(editingTask) || newTask !== null} task={editingTask} defaults={newTask ? { dueDate: newTask } : undefined} onClose={() => { setEditingTask(null); setNewTask(null); }} onSaved={reloadAll} />
      <EventModal open={Boolean(editingEvent) || newEvent !== null} event={editingEvent} defaultDate={newEvent ?? undefined} onClose={() => { setEditingEvent(null); setNewEvent(null); }} onSaved={reloadAll} />
    </div>
  );
}

function DayList({ date, data, onTask, onEvent, onToggle, today }: { date: string; data?: { tasks: Task[]; events: CalEvent[] }; onTask: (t: Task) => void; onEvent: (e: CalEvent) => void; onToggle: (t: Task) => void; today: string }) {
  if (!data || (!data.tasks.length && !data.events.length)) return <EmptyState title={`Nothing on ${formatDate(date)}`} hint="Add a task or an event for this day." />;
  return (
    <div className="space-y-4">
      {data.events.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Confirmed events</h3>
          {data.events.map((e) => (
            <button key={e.id} onClick={() => onEvent(e)} className="flex w-full items-start gap-3 rounded-lg border border-purple/40 bg-purple-soft/50 px-3 py-2 text-left">
              <span className="w-24 shrink-0 text-sm font-semibold text-purple">{e.startTime ?? "All day"}{e.endTime && `–${e.endTime}`}</span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{e.title}</span>
                {e.location && <span className="block text-xs text-muted">{e.location}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
      {data.tasks.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Tasks due</h3>
          {data.tasks.map((t) => <TaskRow key={t.id} task={t} onToggle={onToggle} onOpen={onTask} today={today} />)}
        </div>
      )}
    </div>
  );
}
