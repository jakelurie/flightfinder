import { runTrip } from './pipeline';
import type { StreamEvent, TripRequestBody } from './types';

type Body = TripRequestBody & { referencePrice?: number };
type Job = { events: StreamEvent[]; done: boolean; started: number; body: string };
const state = globalThis as typeof globalThis & { tripJobs?: Map<string, Job> };
const jobs = state.tripJobs ??= new Map<string, Job>();
const TTL = 2 * 60 * 60 * 1000;

// The local server owns the work. Browser connections only read snapshots.
export function startJob(id: string, body: Body, runner = runTrip) {
  for (const [key, job] of jobs) if (job.done && Date.now() - job.started > TTL) jobs.delete(key);
  const existing = jobs.get(id);
  if (existing) {
    if (existing.body !== JSON.stringify(body)) throw new Error('Search ID already used for a different request.');
    return;
  }
  if ([...jobs.values()].filter(j => !j.done).length >= 3) throw new Error('Three searches are already running. Please wait for one to finish.');
  const job: Job = { events: [], done: false, started: Date.now(), body: JSON.stringify(body) };
  jobs.set(id, job);
  void (async () => {
    try {
      const result = await runner(body, event => job.events.push(event), body.referencePrice);
      job.events.push({ type: 'result', result });
    } catch (error) {
      job.events.push({ type: 'error', message: error instanceof Error ? error.message : 'Search failed.' });
    } finally { job.done = true; }
  })();
}

export function readJob(id: string, after: number) {
  const job = jobs.get(id);
  if (!job) return null;
  return { events: job.events.slice(after), cursor: job.events.length, done: job.done };
}
