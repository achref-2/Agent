export function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseISODate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number) {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function todayISO() {
  return toISODate(new Date());
}

export function formatDate(s: string | null | undefined, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  if (!s) return "";
  return parseISODate(s).toLocaleDateString("en-GB", opts);
}

export function relativeDay(s: string | null, today = todayISO()) {
  if (!s) return "No date";
  if (s === today) return "Today";
  if (s === addDays(today, 1)) return "Tomorrow";
  if (s === addDays(today, -1)) return "Yesterday";
  if (s < today) return `${formatDate(s)} (overdue)`;
  return formatDate(s);
}

export function startOfWeek(s: string) {
  const d = parseISODate(s);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return toISODate(d);
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
