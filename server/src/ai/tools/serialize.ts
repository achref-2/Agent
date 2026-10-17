import type { TaskDoc } from "../../models/Task.js";

export function taskView(t: TaskDoc, tz: string) {
  return {
    id: String(t._id),
    title: t.title,
    description: t.description ? t.description.slice(0, 300) : undefined,
    category: t.category,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate ?? null,
    dueTime: t.dueTime ?? null,
    reminder: t.reminderAt
      ? new Intl.DateTimeFormat("en-CA", { timeZone: tz, dateStyle: "short", timeStyle: "short", hourCycle: "h23" }).format(t.reminderAt)
      : null,
    documentId: t.documentId ? String(t.documentId) : undefined,
  };
}
