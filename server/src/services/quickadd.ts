import * as chrono from "chrono-node";
import { zonedToUtc } from "../lib/dates.js";
import type { TaskCreateInput } from "./tasks.js";

const CATEGORY_HINTS: [RegExp, TaskCreateInput["category"]][] = [
  [/\b(lecture|exam|klausur|uni|university|professor|prof\.?|assignment|seminar|thesis|dsp|study|revise|revision|ilias|th köln)\b/i, "university"],
  [/\b(german|deutsch|vocab|grammar|goethe|telc)\b/i, "german"],
  [/\b(apply|application|bewerbung|job|interview|cv|lebenslauf|werkstudent|cover letter)\b/i, "job"],
  [/\b(anmeldung|bürgeramt|ausländerbehörde|visa|insurance|krankenkasse|rundfunk|bank|tax|steuer|rent|miete|landlord|contract|vertrag)\b/i, "admin"],
];

/**
 * Parses a quick-add line such as "Remind me to email my professor tomorrow at 10 !high" without
 * calling an AI model. Dates are interpreted relative to `now` in the user's timezone.
 */
export function parseQuickAdd(text: string, tz: string, now = new Date()): TaskCreateInput & { reminderAt?: Date } {
  let title = text.trim();
  let priority: TaskCreateInput["priority"] = "medium";
  const prio = /(^|\s)(!urgent|!high|!low|urgent|asap|important)\b/i.exec(title);
  if (prio) {
    const p = prio[2].toLowerCase().replace("!", "");
    priority = p === "low" ? "low" : p === "high" || p === "important" ? "high" : "urgent";
    // "!high" markers are always removed; a bare keyword only when it trails the text ("... asap").
    if (prio[2].startsWith("!") || title.slice(prio.index + prio[0].length).trim() === "") title = title.replace(prio[0], " ");
  }
  const wantsReminder = /^remind me( to)?\b/i.test(title);
  title = title.replace(/^(remind me( to)?|todo:?|task:?)\s*/i, "");

  // Reference date = "now" as wall-clock time in the user's timezone.
  const wall = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(now)
    .replace(", ", "T");
  const ref = new Date(`${wall}:00`);
  const results = chrono.parse(title, ref, { forwardDate: true });
  let dueDate: string | null = null;
  let dueTime: string | null = null;
  if (results.length) {
    const r = results[0];
    const d = r.start;
    dueDate = `${d.get("year")}-${String(d.get("month")).padStart(2, "0")}-${String(d.get("day")).padStart(2, "0")}`;
    if (d.isCertain("hour")) dueTime = `${String(d.get("hour")).padStart(2, "0")}:${String(d.get("minute") ?? 0).padStart(2, "0")}`;
    title = (title.slice(0, r.index) + title.slice(r.index + r.text.length)).replace(/\s+(on|at|by|to|until|bis|am|for)\s*$/i, "");
  }
  title = title.replace(/\s{2,}/g, " ").replace(/[\s,.;-]+$/, "").trim();
  if (title) title = title[0].toUpperCase() + title.slice(1);
  const category = CATEGORY_HINTS.find(([rx]) => rx.test(text))?.[1] ?? "personal";
  const out: TaskCreateInput & { reminderAt?: Date } = { title: title || text.trim(), priority, category, dueDate, dueTime };
  if (wantsReminder && dueDate) {
    out.reminderDate = dueDate;
    out.reminderTime = dueTime ?? "09:00";
    out.reminderAt = zonedToUtc(dueDate, out.reminderTime, tz);
  }
  return out;
}
