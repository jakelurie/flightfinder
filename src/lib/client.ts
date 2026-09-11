import type { StreamEvent, TripRequestBody } from "./types";

export interface AppStatus {
  ai: boolean;
  model: string | null;
  demo: boolean;
  provider: string;
  origins: string[];
}

const PENDING = "flightfinder:pending";
export function pendingTrip(): { body: TripRequestBody; id: string } | null {
  try { return JSON.parse(sessionStorage.getItem(PENDING) ?? "null"); } catch { return null; }
}
export function forgetPendingTrip() { try { sessionStorage.removeItem(PENDING); } catch {} }

/** Reconnect to the same server-owned search after transient network failures. */
export async function streamTrip(
  body: TripRequestBody & { referencePrice?: number },
  onEvent: (e: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const saved = pendingTrip();
  const id = saved && JSON.stringify(saved.body) === JSON.stringify(body) ? saved.id : crypto.randomUUID();
  try { sessionStorage.setItem(PENDING, JSON.stringify({ body, id })); } catch {}
  let started = false, cursor = 0, disconnected = false;
  let lastSuccess = Date.now();
  while (!signal?.aborted) {
    try {
      const timeout = AbortSignal.timeout(12000);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const res = await fetch(started ? `/api/trip?id=${id}&after=${cursor}` : "/api/trip", {
        ...(started ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, searchId: id }) }),
        signal: combined, cache: "no-store",
      });
      if (res.status >= 500) throw new Error("Server temporarily unavailable");
      const data = await res.json();
      if (!res.ok) {
        forgetPendingTrip();
        onEvent({ type: "error", message: data.error ?? "Unable to retrieve search." });
        return;
      }
      lastSuccess = Date.now();
      if (disconnected) onEvent({ type: "progress", stage: "reconnect", message: "Reconnected — picking up your search…" });
      disconnected = false;
      if (!started) started = true;
      else {
        for (const event of data.events as StreamEvent[]) onEvent(event);
        cursor = data.cursor;
        if (data.done) { forgetPendingTrip(); return; }
      }
    } catch {
      if (signal?.aborted) return;
      if (!disconnected) onEvent({ type: "progress", stage: "reconnect", message: "Connection interrupted. Your laptop is still searching; reconnecting…" });
      disconnected = true;
      if (Date.now() - lastSuccess > 180000) throw new Error("Cannot reach your laptop. Reopen this page when connected to resume the search.");
    }
    await new Promise<void>(resolve => {
      const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
      const timer = setTimeout(finish, disconnected ? 2500 : 1000);
      signal?.addEventListener('abort', finish, { once: true });
    });
  }
}
