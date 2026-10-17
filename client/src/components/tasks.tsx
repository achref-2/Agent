import { Bell, Circle, CircleCheck, FileText, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../lib/api";
import { relativeDay, todayISO } from "../lib/dates";
import type { CalEvent, Category, Priority, Task, TaskStatus } from "../lib/types";
import { useToast } from "./toast";
import { Badge, Button, cx, ErrorBox, Field, Input, Modal, Select, Textarea } from "./ui";

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "university", label: "University" },
  { id: "german", label: "German" },
  { id: "job", label: "Job" },
  { id: "admin", label: "Admin" },
  { id: "personal", label: "Personal" },
  { id: "other", label: "Other" },
];
export const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
export const STATUSES: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "To do" },
  { id: "in_progress", label: "In progress" },
  { id: "done", label: "Done" },
  { id: "cancelled", label: "Cancelled" },
];
export const priorityTone = (p: Priority) => (p === "urgent" ? "danger" : p === "high" ? "warning" : p === "medium" ? "accent" : "neutral");

export function TaskRow({ task, onToggle, onOpen, today = todayISO(), compact }: { task: Task; onToggle: (t: Task) => void; onOpen?: (t: Task) => void; today?: string; compact?: boolean }) {
  const done = task.status === "done";
  const overdue = !done && task.dueDate && task.dueDate < today;
  return (
    <div className={cx("group flex items-start gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 transition hover:border-accent/50", done && "opacity-60")}>
      <button onClick={() => onToggle(task)} aria-label={done ? `Mark "${task.title}" as not done` : `Complete "${task.title}"`} className="mt-0.5 text-muted hover:text-success">
        {done ? <CircleCheck className="size-5 text-success" /> : <Circle className="size-5" />}
      </button>
      <button className="min-w-0 flex-1 text-left" onClick={() => onOpen?.(task)}>
        <div className={cx("text-sm font-medium", done && "line-through")}>{task.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <Badge tone="cyan">{task.category}</Badge>
          {task.priority !== "medium" && <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>}
          {task.dueDate && (
            <span className={cx(overdue && "font-medium text-danger")}>
              {relativeDay(task.dueDate, today)}
              {task.dueTime && ` · ${task.dueTime}`}
            </span>
          )}
          {task.reminderAt && !compact && (
            <span className="inline-flex items-center gap-0.5" title={task.reminderSentAt ? "Reminder delivered" : "Reminder scheduled"}>
              <Bell className="size-3" /> {task.reminderSentAt ? "sent" : "set"}
            </span>
          )}
          {task.documentId && !compact && (
            <span className="inline-flex items-center gap-0.5" title="Created from a document">
              <FileText className="size-3" /> doc
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

export function useToggleTask(onChanged: () => void) {
  const toast = useToast();
  return async (t: Task) => {
    try {
      if (t.status === "done") await api.patch(`/tasks/${t.id}`, { status: "todo" });
      else await api.post(`/tasks/${t.id}/complete`);
      toast("success", t.status === "done" ? `Reopened "${t.title}"` : `Completed "${t.title}"`);
      onChanged();
    } catch (err) {
      toast("error", errorMessage(err));
    }
  };
}

interface TaskForm {
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  status: TaskStatus;
  dueDate: string;
  dueTime: string;
  reminderDate: string;
  reminderTime: string;
}

function reminderParts(iso: string | null) {
  if (!iso) return { reminderDate: "", reminderTime: "" };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { reminderDate: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, reminderTime: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export function TaskModal({ open, task, defaults, onClose, onSaved }: { open: boolean; task?: Task | null; defaults?: Partial<TaskForm>; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<TaskForm>(() => blank());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function blank(): TaskForm {
    return { title: "", description: "", category: "personal", priority: "medium", status: "todo", dueDate: "", dueTime: "", reminderDate: "", reminderTime: "", ...defaults };
  }

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDelete(false);
    setForm(
      task
        ? { title: task.title, description: task.description, category: task.category, priority: task.priority, status: task.status, dueDate: task.dueDate ?? "", dueTime: task.dueTime ?? "", ...reminderParts(task.reminderAt) }
        : blank(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task]);

  const set = <K extends keyof TaskForm>(k: K, v: TaskForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const body = {
      ...form,
      dueDate: form.dueDate || null,
      dueTime: form.dueTime || null,
      reminderDate: form.reminderDate || null,
      reminderTime: form.reminderDate ? form.reminderTime || "09:00" : null,
    };
    try {
      if (task) await api.patch(`/tasks/${task.id}`, body);
      else await api.post("/tasks", body);
      toast("success", task ? "Task updated" : "Task created");
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!task) return;
    setPending(true);
    try {
      await api.delete(`/tasks/${task.id}`);
      toast("success", `Deleted "${task.title}"`);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={task ? "Edit task" : "New task"}>
      <form id="task-form" onSubmit={save} className="space-y-4">
        <Field label="Title">{(id) => <Input id={id} required maxLength={200} value={form.title} onChange={(e) => set("title", e.target.value)} />}</Field>
        <Field label="Description">{(id) => <Textarea id={id} maxLength={5000} value={form.description} onChange={(e) => set("description", e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Category">
            {(id) => (
              <Select id={id} value={form.category} onChange={(e) => set("category", e.target.value as Category)}>
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Priority">
            {(id) => (
              <Select id={id} value={form.priority} onChange={(e) => set("priority", e.target.value as Priority)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Status">
            {(id) => (
              <Select id={id} value={form.status} onChange={(e) => set("status", e.target.value as TaskStatus)}>
                {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date">{(id) => <Input id={id} type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />}</Field>
          <Field label="Time (optional)">{(id) => <Input id={id} type="time" value={form.dueTime} onChange={(e) => set("dueTime", e.target.value)} />}</Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Reminder date" hint="In-app reminder while GhostMate is open.">
            {(id) => <Input id={id} type="date" value={form.reminderDate} onChange={(e) => set("reminderDate", e.target.value)} />}
          </Field>
          <Field label="Reminder time">{(id) => <Input id={id} type="time" value={form.reminderTime} disabled={!form.reminderDate} onChange={(e) => set("reminderTime", e.target.value)} />}</Field>
        </div>
        {error && <ErrorBox message={error} />}
      </form>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        {task ? (
          confirmDelete ? (
            <div className="flex items-center gap-2 text-sm">
              <span>Delete permanently?</span>
              <Button variant="danger" size="sm" onClick={remove} loading={pending}>Delete</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>Delete</Button>
          )
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="task-form" loading={pending}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

export function EventModal({ open, event, defaultDate, onClose, onSaved }: { open: boolean; event?: CalEvent | null; defaultDate?: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const empty = { title: "", date: defaultDate ?? todayISO(), startTime: "", endTime: "", location: "", notes: "", category: "university" as Category, repeatWeeklyUntil: "" };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(event ? { title: event.title, date: event.date, startTime: event.startTime ?? "", endTime: event.endTime ?? "", location: event.location, notes: event.notes, category: event.category, repeatWeeklyUntil: "" } : empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event, defaultDate]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const body: Record<string, unknown> = { ...form, startTime: form.startTime || null, endTime: form.endTime || null };
    if (event) delete body.repeatWeeklyUntil;
    else body.repeatWeeklyUntil = form.repeatWeeklyUntil || null;
    try {
      if (event) await api.patch(`/events/${event.id}`, body);
      else await api.post("/events", body);
      toast("success", event ? "Event updated" : "Event added");
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!event) return;
    try {
      await api.delete(`/events/${event.id}`);
      toast("success", event.recurring ? "Deleted the whole recurring series" : "Event deleted");
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={event ? "Edit event" : "New event"}
      footer={
        <>
          {event && <Button variant="danger" className="mr-auto" onClick={remove}>{event.recurring ? "Delete series" : "Delete"}</Button>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="event-form" loading={pending}>Save</Button>
        </>
      }
    >
      <form id="event-form" onSubmit={save} className="space-y-4">
        <Field label="Title">{(id) => <Input id={id} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. DSP lecture" />}</Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date">{(id) => <Input id={id} type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />}</Field>
          <Field label="Start">{(id) => <Input id={id} type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />}</Field>
          <Field label="End">{(id) => <Input id={id} type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />}</Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Location">{(id) => <Input id={id} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Campus Deutz, room …" />}</Field>
          <Field label="Category">
            {(id) => (
              <Select id={id} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Category })}>
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            )}
          </Field>
        </div>
        {!event && (
          <Field label="Repeat weekly until (optional)" hint="For lectures that happen every week this semester.">
            {(id) => <Input id={id} type="date" value={form.repeatWeeklyUntil} onChange={(e) => setForm({ ...form, repeatWeeklyUntil: e.target.value })} />}
          </Field>
        )}
        <Field label="Notes">{(id) => <Textarea id={id} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}</Field>
        {error && <ErrorBox message={error} />}
      </form>
    </Modal>
  );
}
