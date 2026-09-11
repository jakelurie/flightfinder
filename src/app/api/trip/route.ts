import { startJob, readJob } from '@/lib/trip-jobs';
import type { TripRequestBody } from '@/lib/types';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
export async function POST(request: Request) {
  let body: TripRequestBody & { referencePrice?: number; searchId?: string };
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (typeof body.query !== 'string' || !body.query.trim()) return Response.json({ error: 'Tell me about the trip first.' }, { status: 400 });
  const { searchId, ...trip } = body;
  if (!searchId || !/^[a-zA-Z0-9-]{16,80}$/.test(searchId)) return Response.json({ error: 'Invalid search ID' }, { status: 400 });
  trip.query = trip.query.slice(0, 1000);
  if (trip.followUp) trip.followUp = trip.followUp.slice(0, 500);
  try { startJob(searchId, trip); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to start search' }, { status: 409 }); }
  return Response.json({ searchId }, { headers });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const after = Number(url.searchParams.get('after') ?? 0);
  if (!Number.isSafeInteger(after) || after < 0) return Response.json({ error: 'Invalid cursor' }, { status: 400 });
  const job = readJob(url.searchParams.get('id') ?? '', after);
  if (!job) return Response.json({ error: 'The laptop restarted or this search expired. Please run the search again.' }, { status: 404, headers });
  return Response.json(job, { headers });
}
