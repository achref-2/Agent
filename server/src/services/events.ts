import { Types } from "mongoose";
import { z } from "zod";
import { notFound } from "../lib/errors.js";
import { hhmm, isoDate } from "../lib/validate.js";
import { addDays } from "../lib/dates.js";
import { CalendarEvent } from "../models/Event.js";
import type { UserDoc } from "../models/User.js";

export const EventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  date: isoDate,
  startTime: hhmm.nullable().optional(),
  endTime: hhmm.nullable().optional(),
  location: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  category: z.enum(["university", "german", "job", "admin", "personal", "other"]).optional(),
  repeatWeeklyUntil: isoDate.nullable().optional(),
});
export type EventInput = z.infer<typeof EventSchema>;

export async function createEvent(user: UserDoc, input: EventInput, source: "manual" | "assistant" = "manual") {
  return CalendarEvent.create({ ...input, userId: user._id, source });
}

export async function updateEvent(user: UserDoc, id: string, input: Partial<EventInput>) {
  if (!Types.ObjectId.isValid(id)) throw notFound("Event");
  const ev = await CalendarEvent.findOneAndUpdate({ _id: id, userId: user._id }, input, { new: true, runValidators: true });
  if (!ev) throw notFound("Event");
  return ev;
}

export async function deleteEvent(user: UserDoc, id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound("Event");
  const ev = await CalendarEvent.findOneAndDelete({ _id: id, userId: user._id });
  if (!ev) throw notFound("Event");
  return ev;
}

export interface EventOccurrence {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  location: string;
  notes: string;
  category: string;
  recurring: boolean;
}

/** Expands weekly recurring events into concrete occurrences within [from, to]. */
export async function listEventOccurrences(user: UserDoc, from: string, to: string): Promise<EventOccurrence[]> {
  const events = await CalendarEvent.find({
    userId: user._id,
    $or: [
      { date: { $gte: from, $lte: to } },
      { repeatWeeklyUntil: { $gte: from }, date: { $lte: to } },
    ],
  });
  const out: EventOccurrence[] = [];
  for (const e of events) {
    const base = {
      id: String(e._id),
      title: e.title,
      startTime: e.startTime ?? null,
      endTime: e.endTime ?? null,
      location: e.location ?? "",
      notes: e.notes ?? "",
      category: e.category ?? "other",
      recurring: Boolean(e.repeatWeeklyUntil),
    };
    if (!e.repeatWeeklyUntil) {
      out.push({ ...base, date: e.date });
      continue;
    }
    for (let d = e.date; d <= e.repeatWeeklyUntil && d <= to; d = addDays(d, 7)) {
      if (d >= from) out.push({ ...base, date: d });
    }
  }
  return out.sort((a, b) => (a.date + (a.startTime ?? "")).localeCompare(b.date + (b.startTime ?? "")));
}
