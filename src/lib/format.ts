// Formatting helpers shared by server (analysis text) and client (UI).

export function fmtPrice(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** "about 5 hours" style for prose. */
export function fmtHoursProse(min: number): string {
  const h = min / 60;
  if (h < 1) return `${Math.round(min)} minutes`;
  const rounded = Math.round(h * 2) / 2;
  return `about ${rounded % 1 ? rounded : rounded.toFixed(0)} hour${rounded === 1 ? "" : "s"}`;
}

export function fmtStops(stops: number): string {
  return stops === 0 ? "Nonstop" : stops === 1 ? "1 stop" : `${stops} stops`;
}

export function fmtTime(dateTime: string | undefined): string {
  if (!dateTime) return "";
  const m = dateTime.match(/(\d{1,2}):(\d{2})/);
  if (!m) return dateTime;
  const h = Number(m[1]);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}:${m[2]}${suffix}`;
}

export function hourOf(dateTime: string | undefined): number | undefined {
  const m = dateTime?.match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) + Number(m[2]) / 60 : undefined;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
