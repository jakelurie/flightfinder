// All trip dates are plain YYYY-MM-DD strings; math is done in UTC to avoid DST drift.

export function todayISO(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseISO(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(date: string, days: number): string {
  const dt = parseISO(date);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
}

export function isISODate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseISO(s).getTime());
}

export function weekday(date: string): number {
  return parseISO(date).getUTCDay();
}

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function monthOf(date: string): number {
  return parseISO(date).getUTCMonth() + 1;
}

export function formatShort(date: string): string {
  return parseISO(date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatRange(a: string, b: string): string {
  const da = parseISO(a);
  const db = parseISO(b);
  if (da.getUTCMonth() === db.getUTCMonth()) {
    return `${formatShort(a)}–${db.getUTCDate()}`;
  }
  return `${formatShort(a)} – ${formatShort(b)}`;
}

/** n dates spread evenly across [start, end] inclusive. */
export function spreadDates(start: string, end: string, n: number): string[] {
  const span = Math.max(0, daysBetween(start, end));
  if (n <= 1 || span === 0) return [start];
  const count = Math.min(n, span + 1);
  const out = new Set<string>();
  for (let i = 0; i < count; i++) out.add(addDays(start, Math.round((span * i) / (count - 1))));
  return [...out];
}
