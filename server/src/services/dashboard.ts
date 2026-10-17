import { getProvider } from "../ai/index.js";
import { addDays, nowTimeInTz, todayInTz, weekdayName } from "../lib/dates.js";
import { Application } from "../models/Application.js";
import { Briefing } from "../models/misc.js";
import { Task } from "../models/Task.js";
import type { UserDoc } from "../models/User.js";
import { listEventOccurrences } from "./events.js";
import { listTasks } from "./tasks.js";

export async function getDashboard(user: UserDoc) {
  const today = todayInTz(user.timezone);
  const weekEnd = addDays(today, 7);
  const [topPriorities, dueToday, overdue, upcoming, recent, inProgress, eventsToday, eventsUpcoming, statusCounts, followUps, briefing] = await Promise.all([
    listTasks(user, { status: "open", sort: "urgency", limit: 5 }),
    listTasks(user, { dueFrom: today, dueTo: today, sort: "due" }),
    listTasks(user, { overdue: true, sort: "due" }),
    listTasks(user, { dueFrom: addDays(today, 1), dueTo: weekEnd, sort: "due", limit: 20 }),
    Task.find({ userId: user._id }).sort({ createdAt: -1 }).limit(5),
    listTasks(user, { status: "in_progress", sort: "updated", limit: 10 }),
    listEventOccurrences(user, today, today),
    listEventOccurrences(user, addDays(today, 1), weekEnd),
    Application.aggregate<{ _id: string; count: number }>([{ $match: { userId: user._id } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Application.find({ userId: user._id, followUpDate: { $ne: null, $lte: weekEnd }, status: { $in: ["applied", "interview"] } })
      .sort({ followUpDate: 1 })
      .select("company title status followUpDate"),
    Briefing.findOne({ userId: user._id, date: today }),
  ]);
  return {
    today,
    weekday: weekdayName(today),
    topPriorities,
    dueToday: dueToday.filter((t) => t.status === "todo" || t.status === "in_progress"),
    completedToday: dueToday.filter((t) => t.status === "done").length,
    overdue,
    upcoming,
    recent,
    inProgress,
    eventsToday,
    eventsUpcoming,
    applications: Object.fromEntries(statusCounts.map((s) => [s._id, s.count])),
    followUps,
    briefing: briefing ? { content: briefing.content, generatedAt: briefing.updatedAt } : null,
  };
}

export async function generateBriefing(user: UserDoc) {
  const d = await getDashboard(user);
  const fmt = (t: { title: string; dueDate?: string | null; dueTime?: string | null; priority: string; category: string }) =>
    `${t.title} [${t.category}, ${t.priority}${t.dueDate ? `, due ${t.dueDate}${t.dueTime ? " " + t.dueTime : ""}` : ""}]`;
  const data = [
    `Today: ${d.weekday} ${d.today}, local time ${nowTimeInTz(user.timezone)}`,
    `Confirmed events today: ${d.eventsToday.map((e) => `${e.startTime ?? "all day"} ${e.title}${e.location ? ` @ ${e.location}` : ""}`).join("; ") || "none"}`,
    `Due today: ${d.dueToday.map(fmt).join("; ") || "none"}`,
    `Overdue: ${d.overdue.map(fmt).join("; ") || "none"}`,
    `Top priorities: ${d.topPriorities.map(fmt).join("; ") || "none"}`,
    `Next 7 days: ${d.upcoming.map(fmt).join("; ") || "none"}`,
    `Events next 7 days: ${d.eventsUpcoming.map((e) => `${e.date} ${e.startTime ?? ""} ${e.title}`).join("; ") || "none"}`,
    `Applications by status: ${JSON.stringify(d.applications)}`,
    `Application follow-ups due this week: ${d.followUps.map((a) => `${a.followUpDate} ${a.title} at ${a.company}`).join("; ") || "none"}`,
  ].join("\n");
  const provider = getProvider();
  const content = await provider.generateText({
    system:
      "You are GhostMate, writing a short personal morning briefing for a Master's student in Köln. Use only the data given; do not invent tasks, events or numbers. Markdown, under 180 words: a one-line greeting, 'Today' (confirmed items), 'Focus' (2-3 priorities and why), and 'Heads-up' (overdue items or follow-ups) only if there are any. Mark any schedule ideas as suggestions.",
    prompt: data,
    maxTokens: 4000,
  });
  const b = await Briefing.findOneAndUpdate({ userId: user._id, date: d.today }, { content, model: provider.model }, { upsert: true, new: true });
  return { content: b.content, generatedAt: b.updatedAt };
}
