import { searchJourneys } from "./journeys";
import { analyzeResults } from "./analyze";
import { todayISO } from "./dates";
import { computeInsights, dateBuckets, datePoints } from "./insights";
import { interpretRequest, normalizeIntent, refineRequest } from "./interpret";
import { getProvider } from "./providers";
import { destinationCards, pickCategories, rankItineraries } from "./rank";
import { searchTrip } from "./search";
import type { StreamEvent, TripRequestBody, TripResult } from "./types";

type Emit = (event: StreamEvent) => void;

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};

/** Natural language → intent → search → rank → analyze, emitting progress along the way. */
export async function runTrip(body: TripRequestBody, emit: Emit, referencePrice?: number): Promise<TripResult> {
  const progress = (stage: string, message: string) => emit({ type: "progress", stage, message });
  const followUps = body.followUps ?? [];

  progress("understand", body.followUp ? "Updating your trip…" : "Understanding your trip…");
  let interpreted: { intent: TripResult["intent"]; by: "ai" | "rules" };
  if (body.intentOverride) {
    interpreted = { intent: normalizeIntent(body.intentOverride), by: "rules" };
  } else if (body.followUp && body.previousIntent) {
    interpreted = await refineRequest({ query: body.query, followUps, followUp: body.followUp, previous: body.previousIntent, referencePrice });
  } else {
    interpreted = await interpretRequest(body.query);
  }
  const { intent } = interpreted;
  emit({ type: "intent", intent, interpretedBy: interpreted.by });

  const provider = getProvider();
  if (intent.tripType === "one_way" || intent.tripType === "multi_city") return searchJourneys(body, intent, interpreted.by, provider, progress);
  const outcome = await searchTrip(intent, provider, progress);
  if (!outcome.itineraries.length) {
    if (outcome.errors.length) throw new Error(outcome.errors[0]);
    throw new Error(
      outcome.warnings.includes("budget")
        ? "Hit the search limit before finding flights. Try a narrower request."
        : "No flights matched those constraints. Try widening the dates, stops or destination.",
    );
  }

  progress("rank", `Ranking ${outcome.itineraries.length} itineraries…`);
  const ranked = rankItineraries(outcome.itineraries, intent);
  const categories = pickCategories(ranked, intent);
  const destinations = intent.destinationMode === "specific" ? [] : destinationCards(ranked, intent);

  const best = ranked[0];
  const focus = ranked.filter((it) => it.destinationCity === best.destinationCity);
  const buckets = dateBuckets(focus, todayISO());
  const insights = computeInsights(focus, best, buckets, intent.origins[0]);
  const medianPrice = median(ranked.map((r) => r.price));

  progress("analyze", "Analyzing the best options…");
  const analysis = await analyzeResults({
    query: body.query,
    followUps: body.followUp ? [...followUps, body.followUp] : followUps,
    intent,
    ranked,
    categories,
    insights,
    buckets,
    medianPrice,
    totalItineraries: ranked.length,
    demo: provider.demo,
  });

  // Ship the top of the ranking plus anything a card or category points at.
  const keep = new Set([
    ...ranked.slice(0, 24).map((r) => r.id),
    ...categories.map((c) => c.itineraryId),
    ...destinations.map((d) => d.itineraryId),
    analysis.recommendedId,
  ]);

  const warnings: string[] = [];
  if (outcome.warnings.includes("budget")) warnings.push("Search stopped early at the configured request limit, so some dates weren't checked.");
  if (outcome.errors.length) warnings.push(`Some searches failed: ${outcome.errors[0]}`);
  if (outcome.warnings.includes("duration-limit")) warnings.push(`Nothing fit under ${intent.maxFlightHours}h of flying, so longer flights are shown.`);
  if (outcome.warnings.includes("discovery-fallback")) warnings.push("Destination discovery returned nothing, so a built-in list of destinations was searched instead.");

  return {
    query: body.query,
    followUps: body.followUp ? [...followUps, body.followUp] : followUps,
    intent,
    interpretedBy: interpreted.by,
    demo: provider.demo,
    providerName: provider.name,
    analysis,
    itineraries: ranked.filter((r) => keep.has(r.id)),
    categories,
    destinations,
    dateFocus: buckets.length ? best.destinationCity : null,
    dateBuckets: buckets,
    datePoints: datePoints(focus),
    insights,
    stats: {
      itinerariesFound: ranked.length,
      destinationsChecked: Math.max(outcome.destinationsChecked, new Set(ranked.map((r) => r.destinationCity)).size),
      providerCalls: outcome.providerCalls,
      cacheHits: outcome.cacheHits,
      medianPrice,
    },
    warnings,
    generatedAt: new Date().toISOString(),
  };
}
