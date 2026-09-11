import { addDays, isISODate, todayISO, WEEKDAY_NAMES, weekday } from "./dates";
import { nearbyAirports } from "./geo";
import { ruleInterpret } from "./heuristic";
import { hasLLM, structuredCall } from "./llm";
import { z } from "zod";
import { TripIntentSchema, type TripIntent } from "./types";

export function defaultOrigins(): string[] {
  return (process.env.DEFAULT_ORIGINS || "SFO,OAK,SJC")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{3}$/.test(s));
}

const GUIDE = `Field guidance:
- tripType: round_trip normally; one_way for a flight without a return; multi_city for visiting multiple cities, stopovers lasting days, or requests to suggest interesting routes.
- For multi_city, populate routeCandidates with 1-3 feasible routes of 2-3 different cities and nights in each. Preserve explicitly requested order and exact stays. If asked for ideas, propose geographically sensible extra cities, including a different route home. Total nights should fit the requested length. returnHome is true unless an open-ended or one-way route is requested. For one_way provide up to 3 destination candidates with nights 0 and returnHome false; no return date is searched. Keep previous routeCandidates on follow-ups, modifying their nights/order/destinations as requested. If a multi-city traveler says make it one way, preserve the cities and use multi_city with returnHome false. Set [] for round_trip.
- budgetMax means TOTAL airfare across all legs, not each leg. Only propose places; flight prices are searched separately.
- destinationMode "specific": they named a city, island or country. Fill destinationAirports with that place's main IATA airports (include same-city alternates, e.g. Tokyo = HND, NRT; a country = its 1-3 main international gateways) and set destinationLabel.
- destinationMode "region": they named a broad area (Europe, Southeast Asia, the Caribbean). Fill regions; leave destinationAirports empty.
- destinationMode "anywhere": open-ended. Put vibes (tropical, beaches, nightlife, warm) into interests/weather instead of picking places. Only set regions if they clearly constrained the area.
- Dates: turn relative phrases into a departure window [earliestDeparture, latestDeparture]. Never earlier than tomorrow. "next two weeks" = tomorrow to +14 days. "next month" = the next calendar month. "soon" ≈ the next 3 weeks. If someone has a specific week off, the whole trip must fit inside it: constrain the window and nights. If no timing is given, use roughly the next 5 weeks.
- tripNightsMin/Max are nights away. "about a week" = 6-8. "7-10 days" = 6-9 nights. Unstated: 5-9 for long-haul/international, 3-5 for short domestic trips.
- budgetMax: only if a number is stated or clearly implied. "cheap" alone is priceSensitivity "high", not a budget.
- priceSensitivity: "extreme" for absolute cheapest; "high" for cheap/deal-hunting; "medium" default; "low" when they will pay more for better flights.
- flightQualityImportance: "high" when they care about good flights, comfort, nonstop, not suffering. preferNonstop when they mention nonstop/direct. maxStops only when they impose a hard limit (0 = nonstop only).
- maxFlightHours: only if they signal a tolerance (e.g. "not more than 10 hours").
- wantsFarAway: true for far away, long-haul, exotic, other side of the world.
- scope: "international" for international/abroad/outside the US, "domestic" for within the US.
- nearbyAirportsOk: default true. origins should list the home airport plus close alternates.
- adventurousness: how unusual the suggestions may be.
- excludeDestinations: places they said to avoid (IATA codes or city names).
- assumptions: 2-5 very short phrases describing non-obvious choices you made ("Leaving from SFO, OAK or SJC", "Assumed 6-8 nights").
- summary: one friendly sentence restating the trip.`;

function header(today: string, origins: string[]): string {
  return `Today is ${WEEKDAY_NAMES[weekday(today)]}, ${today}. The traveler lives near ${origins.join(", ")} (first is their home airport) unless they say otherwise. Prices are USD for one adult; the budget covers every flight in the requested trip.`;
}

export async function interpretRequest(query: string): Promise<{ intent: TripIntent; by: "ai" | "rules" }> {
  const today = todayISO();
  const origins = defaultOrigins();
  if (hasLLM()) {
    try {
      const raw = await structuredCall({
        schema: TripIntentSchema,
        system: `You convert a traveler's free-form trip request into structured flight-search parameters. ${header(today, origins)}\n\n${GUIDE}`,
        user: query,
        effort: "low",
      });
      return { intent: normalizeIntent(raw, today, origins, ruleInterpret(query, today, origins)), by: "ai" };
    } catch (err) {
      console.error("[interpret] LLM failed, using rules:", err);
    }
  }
  return { intent: normalizeIntent(ruleInterpret(query, today, origins), today, origins), by: "rules" };
}

export async function refineRequest(opts: {
  query: string;
  followUps: string[];
  followUp: string;
  previous: TripIntent;
  referencePrice?: number;
}): Promise<{ intent: TripIntent; by: "ai" | "rules" }> {
  const today = todayISO();
  const origins = defaultOrigins();
  if (hasLLM()) {
    try {
      const context = [
        `Original request: ${opts.query}`,
        ...opts.followUps.map((f, i) => `Earlier follow-up ${i + 1}: ${f}`),
        opts.referencePrice ? `The previously recommended itinerary cost $${opts.referencePrice}.` : "",
        `Current search parameters:\n${JSON.stringify(opts.previous, null, 2)}`,
        `New follow-up message: ${opts.followUp}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      const raw = await structuredCall({
        schema: TripIntentSchema,
        system: `You update structured flight-search parameters based on a traveler's follow-up message. ${header(today, origins)}\n\nStart from the current parameters and change only what the follow-up implies; keep everything else. Examples: "wait another month" shifts the departure window ~30 days later; "spend up to $300 more" raises budgetMax by 300 over the current budget or the previously recommended price and lowers priceSensitivity; "forget Tokyo" adds Tokyo to excludeDestinations and, if Tokyo was the specific destination, switches to an open search; "what about Europe" switches to region mode for Europe; "only nonstop" sets maxStops 0. Rewrite summary and assumptions to reflect the updated trip.\n\n${GUIDE}`,
        user: context,
        effort: "low",
      });
      return { intent: normalizeIntent(raw, today, origins, opts.previous), by: "ai" };
    } catch (err) {
      console.error("[refine] LLM failed, using rules:", err);
    }
  }
  const intent = ruleInterpret(opts.followUp, today, origins, opts.previous, opts.referencePrice);
  return { intent: normalizeIntent(intent, today, origins), by: "rules" };
}

const iata = (codes: string[]) => [...new Set(codes.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{3}$/.test(c)))];
const clampInt = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));

function coerceField(schema: z.ZodType, value: unknown, fallback: unknown): unknown {
  const direct = schema.safeParse(value);
  if (direct.success) return direct.data;
  if (typeof value === "string") {
    const lower = schema.safeParse(value.trim().toLowerCase().replace(/[\s-]+/g, "_"));
    if (lower.success) return lower.data;
    if (/^-?\d+(\.\d+)?$/.test(value.trim())) {
      const num = schema.safeParse(Number(value));
      if (num.success) return num.data;
    }
  }
  if (schema instanceof z.ZodArray && Array.isArray(value)) {
    return value.map((v) => coerceField(schema.element as z.ZodType, v, undefined)).filter((v) => v !== undefined);
  }
  return fallback;
}

/** Keep every field that validates (after light repair); take the rest from `fallback`. */
export function coerceIntent(input: unknown, fallback: TripIntent): TripIntent {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(TripIntentSchema.shape)) {
    out[key] = key in raw ? coerceField(schema as z.ZodType, raw[key], fallback[key as keyof TripIntent]) : fallback[key as keyof TripIntent];
  }
  return out as TripIntent;
}

/** Validate and repair an intent so the search layer can trust every field. */
export function normalizeIntent(input: unknown, today = todayISO(), fallbackOrigins = defaultOrigins(), fallback?: TripIntent): TripIntent {
  const i: TripIntent = { ...coerceIntent(input, fallback ?? ruleInterpret("", today, fallbackOrigins)) };

  let origins = iata(i.origins ?? []);
  if (!origins.length) origins = fallbackOrigins;
  if (i.nearbyAirportsOk && origins.length === 1) origins = nearbyAirports(origins[0]).slice(0, 3);
  i.origins = origins.slice(0, 4);

  i.destinationAirports = iata(i.destinationAirports ?? []).filter((c) => !i.origins.includes(c)).slice(0, 4);
  if (i.destinationMode === "specific" && !i.destinationAirports.length) i.destinationMode = i.regions?.length ? "region" : "anywhere";
  if (i.destinationMode === "region" && !i.regions.length) i.destinationMode = "anywhere";
  i.regions = [...new Set(i.regions ?? [])];

  const tomorrow = addDays(today, 1);
  let earliest = isISODate(i.earliestDeparture) ? i.earliestDeparture : addDays(today, 3);
  if (earliest < tomorrow) earliest = tomorrow;
  let latest = isISODate(i.latestDeparture) ? i.latestDeparture : addDays(earliest, 30);
  if (latest < earliest) latest = addDays(earliest, 7);
  const horizon = addDays(today, 320);
  if (latest > horizon) latest = horizon;
  if (earliest > latest) earliest = latest;
  i.earliestDeparture = earliest;
  i.latestDeparture = latest;

  i.tripNightsMin = clampInt(i.tripNightsMin, 1, 30);
  i.tripNightsMax = clampInt(i.tripNightsMax, 1, 30);
  if (i.tripNightsMin > i.tripNightsMax) [i.tripNightsMin, i.tripNightsMax] = [i.tripNightsMax, i.tripNightsMin];

  i.budgetMax = i.budgetMax && i.budgetMax > 0 ? Math.round(i.budgetMax) : null;
  i.maxStops = i.maxStops === null || i.maxStops === undefined ? null : clampInt(i.maxStops, 0, 3);
  i.maxFlightHours = i.maxFlightHours && i.maxFlightHours > 0 ? i.maxFlightHours : null;
  i.excludeDestinations = [...new Set((i.excludeDestinations ?? []).map((s) => s.trim()).filter(Boolean))];
  i.assumptions = (i.assumptions ?? []).slice(0, 6);
  return i;
}
