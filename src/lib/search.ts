import { cacheGet, cacheSet } from "./cache";
import { addDays, daysBetween, formatShort, monthOf, spreadDates } from "./dates";
import { DESTINATIONS, REGION_KGMID, REGION_LABELS, airportCoords, distanceBetween, findDestination, haversineMiles, regionForCountry } from "./geo";
import { mapLimit } from "./limit";
import type { ExploreDestination, ExploreQuery, FlightProvider, FlightQuery } from "./providers/types";
import { matchScore } from "./rank";
import type { Itinerary, Region, TripIntent } from "./types";

export type ProgressFn = (stage: string, message: string) => void;

export interface SearchOutcome {
  itineraries: Itinerary[];
  providerCalls: number;
  cacheHits: number;
  destinationsChecked: number;
  warnings: string[];
  errors: string[];
}

const MAX_CALLS = Number(process.env.SEARCH_MAX_PROVIDER_CALLS ?? 30);
const CONCURRENCY = Number(process.env.SEARCH_CONCURRENCY ?? 4);
const US = new Set(["United States", "USA", "Puerto Rico", "US"]);

/** Wraps a provider with caching, a hard call budget, de-duplication and result collection. */
class Searcher {
  calls = 0;
  cacheHits = 0;
  warnings: string[] = [];
  errors: string[] = [];
  private seen = new Set<string>();
  private collected = new Map<string, Itinerary>();

  constructor(
    private provider: FlightProvider,
    private maxCalls: number,
  ) {}

  get budgetLeft() {
    return this.maxCalls - this.calls;
  }

  get itineraries(): Itinerary[] {
    return [...this.collected.values()];
  }

  private async cached<T>(ns: string, query: object, fn: () => Promise<T>): Promise<T | undefined> {
    const key = { provider: this.provider.name, ...query };
    const hit = await cacheGet<T>(ns, key);
    if (hit !== undefined) {
      this.cacheHits++;
      return hit;
    }
    if (this.calls >= this.maxCalls) {
      if (!this.warnings.includes("budget")) this.warnings.push("budget");
      return undefined;
    }
    this.calls++;
    try {
      const value = await fn();
      await cacheSet(ns, key, value);
      return value;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!this.errors.includes(msg)) this.errors.push(msg);
      throw err;
    }
  }

  async explore(q: ExploreQuery): Promise<ExploreDestination[]> {
    return (await this.cached("explore", q, () => this.provider.explore(q))) ?? [];
  }

  async flights(q: FlightQuery): Promise<number> {
    const key = JSON.stringify(q);
    if (this.seen.has(key)) return 0;
    this.seen.add(key);
    const res = await this.cached("flights", q, () => this.provider.searchFlights(q));
    for (const it of res?.itineraries ?? []) {
      const existing = this.collected.get(it.id);
      if (!existing || it.price < existing.price) this.collected.set(it.id, it);
    }
    return res?.itineraries.length ?? 0;
  }
}

export function destinationAllowed(
  intent: TripIntent,
  d: { code: string; city: string; country: string; region?: Region },
): boolean {
  const excluded = intent.excludeDestinations.map((x) => x.toLowerCase());
  if (excluded.some((x) => x === d.code.toLowerCase() || x === d.city.toLowerCase() || x === d.country.toLowerCase())) return false;
  const domestic = US.has(d.country);
  if (intent.scope === "domestic" && !domestic) return false;
  if (intent.scope === "international" && domestic) return false;
  if (intent.destinationMode === "region" && d.region && !intent.regions.includes(d.region)) return false;
  const miles = distanceBetween(intent.origins[0], d.code);
  if (miles !== undefined && miles < 150) return false;
  return true;
}

function milesTo(origin: string, lat?: number, lon?: number): number | undefined {
  const from = airportCoords(origin);
  return from && lat !== undefined && lon !== undefined ? haversineMiles(from, { lat, lon }) : undefined;
}

/**
 * Which Explore searches to run. Google's unfiltered Explore only shows places near the origin,
 * so open-ended trips also explore a few regions picked from the request.
 */
export function exploreAreas(intent: TripIntent): (Region | undefined)[] {
  if (intent.destinationMode === "region") return intent.regions.slice(0, 3);
  if (intent.scope === "domestic") return [undefined];
  const picks: Region[] = [];
  if (intent.interests.some((t) => t === "tropical" || t === "beach") || intent.weather === "warm" || intent.weather === "hot") {
    picks.push("caribbean", "mexico_central_america", "southeast_asia");
  }
  if (intent.wantsFarAway) picks.push("east_asia", "europe", "southeast_asia", "south_america", "oceania");
  picks.push("europe", "mexico_central_america", "east_asia", "south_america");
  const byArea = new Map<string, Region>();
  for (const r of picks) {
    const k = REGION_KGMID[r] ?? r;
    if (!byArea.has(k)) byArea.set(k, r);
  }
  const regions = [...byArea.values()].slice(0, intent.scope === "international" ? 4 : 3);
  return intent.scope === "international" ? regions : [undefined, ...regions];
}

const nominalNights = (i: TripIntent) => Math.round((i.tripNightsMin + i.tripNightsMax) / 2);

function cheapestBy<K>(items: Itinerary[], key: (it: Itinerary) => K): Map<K, Itinerary> {
  const out = new Map<K, Itinerary>();
  for (const it of items) {
    const k = key(it);
    const cur = out.get(k);
    if (!cur || it.price < cur.price) out.set(k, it);
  }
  return out;
}

function withinWindow(i: TripIntent, date: string) {
  return date >= i.earliestDeparture && date <= i.latestDeparture;
}

/** Fixed destination: sweep departure dates, then refine around the cheapest ones. */
async function searchSpecific(intent: TripIntent, s: Searcher, progress: ProgressFn) {
  const nights = nominalNights(intent);
  const label = intent.destinationLabel ?? intent.destinationAirports.join("/");
  const windowDays = daysBetween(intent.earliestDeparture, intent.latestDeparture) + 1;
  const dates = spreadDates(intent.earliestDeparture, intent.latestDeparture, Math.min(8, Math.max(1, Math.ceil(windowDays / 3.5))));
  const base = { origins: intent.origins, destinations: intent.destinationAirports, maxStops: intent.maxStops, cabin: intent.cabin };

  progress("dates", `Comparing ${dates.length} departure date${dates.length === 1 ? "" : "s"} to ${label}…`);
  await mapLimit(dates, CONCURRENCY, (d) => s.flights({ ...base, outboundDate: d, returnDate: addDays(d, nights) }));

  const byDate = [...cheapestBy(s.itineraries, (it) => it.departDate).values()].sort((a, b) => a.price - b.price);
  if (!byDate.length) return;
  const top = [byDate[0].departDate];
  const second = byDate.find((it) => Math.abs(daysBetween(top[0], it.departDate)) >= 3);
  if (second) top.push(second.departDate);

  progress("refine", `Refining cheap dates around ${top.map(formatShort).join(" and ")}…`);
  const refine: FlightQuery[] = [];
  const push = (q: FlightQuery) => withinWindow(intent, q.outboundDate) && refine.push(q);
  for (const [k, d] of top.entries()) {
    for (const delta of k === 0 ? [-2, -1, 1, 2] : [-1, 1]) {
      const out = addDays(d, delta);
      push({ ...base, outboundDate: out, returnDate: addDays(out, nights) });
    }
  }
  for (const n of new Set([intent.tripNightsMin, intent.tripNightsMax])) {
    if (n !== nights) push({ ...base, outboundDate: top[0], returnDate: addDays(top[0], n) });
  }
  if ((intent.preferNonstop || intent.flightQualityImportance === "high") && intent.maxStops !== 0) {
    push({ ...base, maxStops: 0, outboundDate: top[0], returnDate: addDays(top[0], nights) });
  }
  await mapLimit(refine, CONCURRENCY, (q) => s.flights(q));
}

interface Candidate extends ExploreDestination {
  region?: Region;
  match: number;
  miles?: number;
  score: number;
  priced: boolean;
}

function rankCandidates(intent: TripIntent, cands: Candidate[]): Candidate[] {
  const priced = cands.filter((c) => c.priced).map((c) => c.price).sort((a, b) => a - b);
  const pct = (sorted: number[], v: number) => (sorted.length <= 1 ? 0.5 : sorted.filter((x) => x < v).length / (sorted.length - 1));
  const miles = cands.map((c) => c.miles ?? 0).sort((a, b) => a - b);
  const cpm = cands.filter((c) => c.priced && c.miles).map((c) => c.price / c.miles!).sort((a, b) => a - b);
  const wPrice = { extreme: 0.55, high: 0.42, medium: 0.32, low: 0.18 }[intent.priceSensitivity];
  const wFar = intent.wantsFarAway ? 0.3 : 0.05;
  for (const c of cands) {
    const priceScore = c.priced ? 1 - pct(priced, c.price) : 0.5;
    const farScore = pct(miles, c.miles ?? 0);
    const valueScore = c.priced && c.miles ? 1 - pct(cpm, c.price / c.miles) : 0.5;
    const wMatch = intent.interests.length || intent.weather !== "any" ? 0.55 : 0.3;
    let score = wPrice * priceScore + wMatch * c.match + wFar * farScore + 0.15 * valueScore;
    if (intent.budgetMax && c.priced && c.price > intent.budgetMax) score -= 0.4;
    c.score = score;
  }
  return cands.sort((a, b) => b.score - a.score);
}

/** Open destination: discover broadly, deep-search the best candidates, refine the leaders. */
async function searchOpen(intent: TripIntent, s: Searcher, progress: ProgressFn): Promise<number> {
  const nights = nominalNights(intent);
  const windowDays = daysBetween(intent.earliestDeparture, intent.latestDeparture) + 1;
  const areas = exploreAreas(intent);
  // Keep discovery to at most ~8 Explore searches: fewer dates when exploring more areas.
  const dateCount = Math.min(windowDays >= 24 ? 3 : windowDays >= 10 ? 2 : 1, Math.max(1, Math.floor(8 / areas.length)));
  const exploreDates = spreadDates(intent.earliestDeparture, intent.latestDeparture, dateCount);
  const where = intent.destinationMode === "region" ? intent.regions.map((r) => REGION_LABELS[r]).join(", ") : "the world";

  progress("discover", `Looking for promising destinations across ${where}…`);
  const exploreQueries = areas.flatMap((region) =>
    exploreDates.map((d) => ({ origin: intent.origins[0], outboundDate: d, returnDate: addDays(d, nights), region, maxStops: intent.maxStops, cabin: intent.cabin })),
  );
  const exploreResults = (await mapLimit(exploreQueries, CONCURRENCY, async (q) => (await s.explore(q)).map((e) => ({ ...e, area: q.region })))).flatMap((r) => r ?? []);

  const byCode = new Map<string, Candidate>();
  for (const e of exploreResults) {
    const cat = findDestination(e.code);
    const region = cat?.region ?? regionForCountry(e.country) ?? e.area;
    const city = cat?.city ?? e.city;
    const country = cat?.country ?? e.country;
    if (!destinationAllowed(intent, { code: e.code, city, country, region })) continue;
    if (intent.maxFlightHours && e.durationMin && e.durationMin > intent.maxFlightHours * 60 * 1.15) continue;
    const cityKey = city.toLowerCase();
    const cur = byCode.get(cityKey);
    if (cur && cur.price <= e.price) continue;
    byCode.set(cityKey, {
      ...e,
      city,
      country,
      region,
      match: matchScore(cat, intent, monthOf(e.departDate)),
      miles: distanceBetween(intent.origins[0], e.code) ?? milesTo(intent.origins[0], e.lat, e.lon),
      score: 0,
      priced: true,
    });
  }

  let candidates = [...byCode.values()];
  if (!candidates.length) {
    // Discovery returned nothing usable — fall back to our own catalog so the search still happens.
    const mid = exploreDates[0];
    candidates = DESTINATIONS.filter((d) => destinationAllowed(intent, d)).map((d) => ({
      code: d.code,
      city: d.city,
      country: d.country,
      region: d.region,
      price: 0,
      departDate: mid,
      returnDate: addDays(mid, nights),
      match: matchScore(d, intent, monthOf(mid)),
      miles: distanceBetween(intent.origins[0], d.code),
      score: 0,
      priced: false,
    }));
    if (candidates.length) s.warnings.push("discovery-fallback");
  } else {
    progress("discover", `Found fares to ${candidates.length} destinations — picking the most promising…`);
  }

  const ranked = rankCandidates(intent, candidates);
  const perCountry = new Map<string, number>();
  const maxDeep = Math.max(3, Math.min(8, s.budgetLeft - 6));
  const chosen: Candidate[] = [];
  for (const c of ranked) {
    if (chosen.length >= maxDeep) break;
    const n = perCountry.get(c.country) ?? 0;
    if (n >= 2) continue;
    perCountry.set(c.country, n + 1);
    chosen.push(c);
  }
  if (!chosen.length) return candidates.length;

  progress("candidates", `Checking the best ${chosen.length} candidates: ${chosen.slice(0, 4).map((c) => c.city).join(", ")}${chosen.length > 4 ? "…" : ""}`);
  const base = { origins: intent.origins, maxStops: intent.maxStops, cabin: intent.cabin };
  await mapLimit(chosen, CONCURRENCY, (c) => {
    const alt = findDestination(c.code)?.alt ?? [];
    const out = withinWindow(intent, c.departDate) ? c.departDate : exploreDates[0];
    const stay = daysBetween(c.departDate, c.returnDate);
    const n = stay >= intent.tripNightsMin && stay <= intent.tripNightsMax ? stay : nights;
    return s.flights({ ...base, destinations: [c.code, ...alt].slice(0, 2), outboundDate: out, returnDate: addDays(out, n) });
  });

  // Refine the three strongest destinations by real fares blended with how well they match.
  const found = cheapestBy(s.itineraries, (it) => it.destinationCity);
  const leaders = [...found.values()]
    .map((it) => ({ it, cand: chosen.find((c) => c.city === it.destinationCity) }))
    .sort((a, b) => a.it.price * (1.3 - (a.cand?.match ?? 0.5) * 0.6) - b.it.price * (1.3 - (b.cand?.match ?? 0.5) * 0.6))
    .slice(0, 3);
  if (!leaders.length) return candidates.length;

  progress("refine", `Refining cheap dates for ${leaders.map((l) => l.it.destinationCity).join(", ")}…`);
  const refine: FlightQuery[] = [];
  for (const [k, { it }] of leaders.entries()) {
    const dests = [it.destination];
    const shifts = k === 0 ? [-3, 3, 7] : [-3, 3];
    for (const delta of shifts) {
      const out = addDays(it.departDate, delta);
      if (withinWindow(intent, out)) refine.push({ ...base, destinations: dests, outboundDate: out, returnDate: addDays(out, it.nights) });
    }
    if (k === 0) {
      for (const n of new Set([intent.tripNightsMin, intent.tripNightsMax])) {
        if (n !== it.nights) refine.push({ ...base, destinations: dests, outboundDate: it.departDate, returnDate: addDays(it.departDate, n) });
      }
    }
  }
  await mapLimit(refine, CONCURRENCY, (q) => s.flights(q));
  return candidates.length;
}

export async function searchTrip(intent: TripIntent, provider: FlightProvider, progress: ProgressFn): Promise<SearchOutcome> {
  const s = new Searcher(provider, MAX_CALLS);
  let destinationsChecked = intent.destinationAirports.length ? 1 : 0;
  if (intent.destinationMode === "specific") {
    await searchSpecific(intent, s, progress);
  } else {
    destinationsChecked = await searchOpen(intent, s, progress);
  }
  const allowed = s.itineraries.filter(
    (it) =>
      (intent.maxStops === null || it.outbound.stops <= intent.maxStops) &&
      (intent.destinationMode === "specific" ||
        destinationAllowed(intent, { code: it.destination, city: it.destinationCity, country: it.destinationCountry, region: findDestination(it.destination)?.region ?? regionForCountry(it.destinationCountry) })),
  );
  // A stated flight-time limit is a hard cutoff, unless nothing at all fits under it.
  const maxMin = intent.maxFlightHours ? intent.maxFlightHours * 60 : Infinity;
  const withinLimit = allowed.filter((it) => it.outbound.durationMin <= maxMin);
  const itineraries = withinLimit.length ? withinLimit : allowed;
  if (!withinLimit.length && allowed.length) s.warnings.push("duration-limit");
  return { itineraries, providerCalls: s.calls, cacheHits: s.cacheHits, destinationsChecked, warnings: s.warnings, errors: s.errors };
}
