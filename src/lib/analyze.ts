import { z } from "zod";
import { daysBetween, formatRange, formatShort, todayISO } from "./dates";
import { airportCity } from "./geo";
import { fmtDuration, fmtHoursProse, fmtPrice, fmtStops } from "./format";
import { hasLLM, structuredCall } from "./llm";
import type { Analysis, Category, DateBucket, Insight, ScoredItinerary, TripIntent } from "./types";

const AnalysisSchema = z.object({
  headline: z.string().describe("Direct recommendation, max ~8 words, e.g. 'Wait two weeks and go to Tokyo'"),
  recommendedId: z.string().describe("id of the itinerary you recommend, copied exactly from the data"),
  explanation: z.string().describe("2-4 conversational sentences explaining what to do and why"),
  whyBetter: z.array(z.string()).describe("2-3 short bullets on why this beats the alternatives"),
  alternativeNote: z.string().nullable().describe("One sentence on the best alternative for a different priority, or null"),
});

export interface AnalysisInput {
  query: string;
  followUps: string[];
  intent: TripIntent;
  ranked: ScoredItinerary[];
  categories: Category[];
  insights: Insight[];
  buckets: DateBucket[];
  medianPrice: number | null;
  totalItineraries: number;
  demo: boolean;
}

function compact(it: ScoredItinerary) {
  return {
    id: it.id,
    destination: `${it.destinationCity}${it.destinationCountry ? `, ${it.destinationCountry}` : ""} (${it.destination})`,
    from: it.origin,
    dates: `${it.departDate} to ${it.returnDate} (${it.nights} nights)`,
    price_usd_round_trip: it.price,
    outbound: `${fmtStops(it.outbound.stops)}, ${fmtDuration(it.outbound.durationMin)}, ${it.outbound.airlines.join("/")}, departs ${it.outbound.departTime}`,
    layovers: it.outbound.layovers.map((l) => `${l.airport} ${fmtDuration(l.durationMin)}${l.overnight ? " overnight" : ""}`),
    distance_miles: it.distanceMiles ?? null,
    typical_price_range: it.typicalPriceRange ?? null,
    score: it.score,
  };
}

/** Every dollar amount the model is allowed to mention: real prices and differences between them. */
export function allowedAmounts(input: AnalysisInput, shown: ScoredItinerary[]): Set<number> {
  const base = new Set<number>();
  for (const it of shown) {
    base.add(it.price);
    if (it.typicalPriceRange) it.typicalPriceRange.forEach((p) => base.add(p));
  }
  input.buckets.forEach((b) => base.add(b.minPrice));
  input.insights.forEach((i) => i.savings && base.add(i.savings));
  for (const i of input.insights) for (const m of i.text.matchAll(/\$([\d,]+)/g)) base.add(Number(m[1].replace(/,/g, "")));
  for (const c of input.categories) for (const m of c.reason.matchAll(/\$([\d,]+)/g)) base.add(Number(m[1].replace(/,/g, "")));
  if (input.intent.budgetMax) base.add(input.intent.budgetMax);
  if (input.medianPrice) base.add(input.medianPrice);
  const all = new Set(base);
  const list = [...base];
  for (const a of list) for (const b of list) if (a > b) all.add(a - b);
  return all;
}

export function amountsAreGrounded(texts: string[], allowed: Set<number>): boolean {
  const allowedList = [...allowed];
  for (const text of texts) {
    for (const m of text.matchAll(/\$\s?([\d,]+(?:\.\d+)?)(\+)?/g)) {
      const n = Number(m[1].replace(/,/g, ""));
      // Allow round-number hedges like "under $800" when that is the user's budget, and ±$3 rounding.
      if (!allowedList.some((a) => Math.abs(a - n) <= 3)) return false;
    }
  }
  return true;
}

export function ruleAnalysis(input: AnalysisInput): Analysis {
  const best = input.ranked[0];
  const today = todayISO();
  const range = formatRange(best.departDate, best.returnDate);
  const open = input.intent.destinationMode !== "specific";
  const waitWeeks = Math.round(daysBetween(today, best.departDate) / 7);
  const windowStartsNow = daysBetween(today, input.intent.earliestDeparture) <= 7;
  const headline =
    !open && windowStartsNow && waitWeeks >= 2 && input.insights.some((i) => i.kind === "timing" && i.savings)
      ? `Wait ${waitWeeks} weeks, then go to ${best.destinationCity}`
      : `${open ? "Go to" : "Book"} ${best.destinationCity}, ${range}`;

  const parts = [
    `${open ? `${best.destinationCity}, ${range},` : range} is the strongest option I found: ${fmtPrice(best.price)} round trip from ${best.origin}, ${fmtStops(best.outbound.stops).toLowerCase()}, ${fmtDuration(best.outbound.durationMin)} on ${best.outbound.airlines.join(" / ")}.`,
  ];
  if (input.medianPrice && input.medianPrice - best.price >= 30) {
    parts.push(`That's ${fmtPrice(input.medianPrice - best.price)} under the median of the ${input.totalItineraries} itineraries I compared.`);
  }
  if (input.insights[0]) parts.push(input.insights[0].text);

  const whyBetter: string[] = [];
  const cheapest = input.categories.find((c) => c.key === "cheapest");
  const cheapestIt = cheapest && input.ranked.find((r) => r.id === cheapest.itineraryId);
  if (cheapestIt) {
    const extraMin = cheapestIt.outbound.durationMin - best.outbound.durationMin;
    whyBetter.push(
      `The ${fmtPrice(cheapestIt.price)} fare to ${cheapestIt.destinationCity} is cheaper${extraMin > 45 ? ` but adds ${fmtDuration(extraMin)} of travel` : cheapestIt.outbound.stops > best.outbound.stops ? " but has more stops" : ", with a weaker overall fit"}.`,
    );
  } else {
    whyBetter.push("It's also the cheapest fare in everything searched.");
  }
  if (best.outbound.stops === 0) whyBetter.push("Nonstop — no connections to miss.");
  if (open && best.breakdown.match >= 0.7) whyBetter.push(`${best.destinationCity} is a strong match for the kind of trip you described.`);
  if (daysBetween(today, best.departDate) <= 14 && open) whyBetter.push(`You can be there by ${formatShort(best.departDate)}.`);

  const flight = input.categories.find((c) => c.key === "best_flight");
  const flightIt = flight && input.ranked.find((r) => r.id === flight.itineraryId);
  const alternativeNote = flightIt
    ? `If you want the easiest itinerary instead, there's a ${fmtPrice(flightIt.price)} ${fmtStops(flightIt.outbound.stops).toLowerCase()} to ${flightIt.destinationCity}${flightIt.outbound.durationMin < best.outbound.durationMin - 60 ? ` that saves ${fmtHoursProse(best.outbound.durationMin - flightIt.outbound.durationMin)}` : ""}.`
    : null;

  return { headline, explanation: parts.join(" "), whyBetter: whyBetter.slice(0, 3), alternativeNote, recommendedId: best.id, by: "rules" };
}

export async function analyzeResults(input: AnalysisInput): Promise<Analysis> {
  if (!hasLLM() || !input.ranked.length) return ruleAnalysis(input);
  const shownIds = new Set([...input.ranked.slice(0, 8).map((r) => r.id), ...input.categories.map((c) => c.itineraryId)]);
  const shown = input.ranked.filter((r) => shownIds.has(r.id));
  const prompt = {
    original_request: input.query,
    follow_ups: input.followUps,
    today: todayISO(),
    interpreted_trip: input.intent.summary,
    home_airports: input.intent.origins.map((o) => `${o} (${airportCity(o)})`),
    budget_usd: input.intent.budgetMax,
    stats: { itineraries_compared: input.totalItineraries, median_price_usd: input.medianPrice },
    top_itineraries_ranked: shown.map(compact),
    categories: input.categories.map((c) => ({ label: c.label, itinerary_id: c.itineraryId, note: c.reason })),
    cheapest_by_departure_week: input.buckets.map((b) => ({ week: b.label, starting: b.startDate, cheapest_usd: b.minPrice })),
    computed_observations: input.insights.map((i) => i.text),
  };
  try {
    const raw = (await structuredCall({
      schema: AnalysisSchema,
      system: `You are a sharp, friendly travel analyst. Someone described a trip in their own words; a flight search engine has already searched real fares and ranked them. Tell them what they should actually do.

Rules:
- Only use flights, prices, dates and differences that appear in the data. Never invent or estimate a fare, and never round a price to a different number. If you compare two prices, use the exact figures given.
- Recommend exactly one itinerary by id. Usually the top-ranked one, but pick another if it clearly better fits what they asked for.
- Be decisive and concrete, like a friend who did the research: lead with the action, then why. Mention the timing sweet spot when the data shows one.
- Write plain text (no markdown). Keep the explanation under 90 words.`,
      user: JSON.stringify(prompt, null, 1),
      effort: "medium",
    })) as Record<string, unknown>;
    const parsed = AnalysisSchema.safeParse({
      ...raw,
      whyBetter: Array.isArray(raw?.whyBetter) ? raw.whyBetter.filter((w) => typeof w === "string") : [],
      alternativeNote: typeof raw?.alternativeNote === "string" && raw.alternativeNote.trim() ? raw.alternativeNote : null,
    });
    if (!parsed.success) throw new Error(`Analysis output invalid: ${parsed.error.message}`);
    const out = parsed.data;
    const recommended = shown.find((r) => r.id === out.recommendedId) ?? input.ranked[0];
    const texts = [out.headline, out.explanation, ...out.whyBetter, out.alternativeNote ?? ""];
    if (!amountsAreGrounded(texts, allowedAmounts(input, shown))) {
      console.warn("[analyze] model mentioned an amount not present in results; using rule-based analysis");
      return ruleAnalysis(input);
    }
    return {
      headline: out.headline,
      explanation: out.explanation,
      whyBetter: out.whyBetter.slice(0, 3),
      alternativeNote: out.alternativeNote,
      recommendedId: recommended.id,
      by: "ai",
    };
  } catch (err) {
    console.error("[analyze] LLM failed, using rules:", err);
    return ruleAnalysis(input);
  }
}
