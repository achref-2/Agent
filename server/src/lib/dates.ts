// Calendar dates are stored as "YYYY-MM-DD" strings in the user's own timezone, so a task due
// "on Friday" never shifts because of UTC conversion. Instants (reminders) are stored as Date.

export function todayInTz(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function nowTimeInTz(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayName(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asUtc - at.getTime()) / 60000;
}

/** Converts a wall-clock date/time in `tz` to a UTC instant. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const naive = new Date(`${date}T${time}:00Z`);
  let guess = new Date(naive.getTime() - tzOffsetMinutes(tz, naive) * 60000);
  // Second pass corrects for DST transitions between the naive guess and the real instant.
  guess = new Date(naive.getTime() - tzOffsetMinutes(tz, guess) * 60000);
  return guess;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
