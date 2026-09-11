import { daysBetween, formatShort, monthOf } from "./dates";
import { REGION_LABELS, findDestination, regionForCountry, warmth, type Destination } from "./geo";
import { fmtDuration, fmtPrice, fmtStops, hourOf, plural } from "./format";
import type { Category, DestinationCard, Itinerary, ScoreBreakdown, ScoredItinerary, TripIntent } from "./types";

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** 0..1 — how well a destination fits the vibe of the request. Unknown places are neutral. */
export function matchScore(d: Pick<Destination, "tags" | "climate" | "lat"> | undefined, intent: TripIntent, month: number): number {
  if (intent.destinationMode === "specific") return 0.7;
  if (!d) return 0.45;
  const parts: [number, number][] = [];
  if (intent.interests.length) {
    const hits = intent.interests.filter((x) => d.tags.includes(x)).length;
    parts.push([hits / intent.interests.length, 0.6]);
  }
  if (intent.weather !== "any") {
    const w = warmth(d, month);
    const s = intent.weather === "cold" ? 1 - w : intent.weather === "mild" ? 1 - Math.abs(w - 0.55) * 1.6 : intent.weather === "hot" ? w ** 1.5 : w;
    parts.push([clamp01(s), 0.4]);
  }
  if (intent.adventurousness === "high") {
    parts.push([d.tags.includes("adventure") || d.tags.includes("nature") ? 0.9 : 0.55, 0.15]);
  }
  if (!parts.length) return 0.6;
  const total = parts.reduce((a, [, w]) => a + w, 0);
  return parts.reduce((a, [s, w]) => a + s * w, 0) / total;
}

/** How much each factor matters for this particular request. Always sums to 1. */
export function weightsFor(intent: TripIntent): ScoreBreakdown {
  const w: ScoreBreakdown = { price: 0.32, duration: 0.14, stops: 0.14, schedule: 0.07, tripLength: 0.06, match: 0.15, value: 0.12 };
  w.price = { extreme: 0.62, high: 0.42, medium: 0.32, low: 0.12 }[intent.priceSensitivity];
  if (intent.flightQualityImportance === "high") Object.assign(w, { duration: 0.24, stops: 0.24, schedule: 0.11 });
  if (intent.flightQualityImportance === "low") Object.assign(w, { duration: 0.07, stops: 0.07, schedule: 0.03 });
  if (intent.preferNonstop) w.stops += 0.1;
  if (intent.wantsFarAway) w.value += 0.25;
  if (intent.destinationMode === "specific") {
    w.match = 0;
    w.value = 0;
  } else if (intent.interests.length || intent.weather !== "any") {
    w.match += 0.1;
  }
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(w) as (keyof ScoreBreakdown)[]) w[k] = w[k] / sum;
  return w;
}

function percentile(sorted: number[], v: number): number {
  if (sorted.length <= 1) return 0.5;
  let below = 0;
  for (const x of sorted) if (x < v) below++;
  return below / (sorted.length - 1);
}

function stopsScore(it: Itinerary): number {
  let s = [1, 0.62, 0.3][it.outbound.stops] ?? 0.1;
  for (const l of it.outbound.layovers) {
    if (l.durationMin < 55) s -= 0.12; // tight connection
    else if (l.overnight || l.durationMin > 420) s -= 0.2;
    else if (l.durationMin > 240) s -= 0.08;
  }
  return clamp01(s);
}

function scheduleScore(it: Itinerary, intent: TripIntent): number {
  const dep = hourOf(it.outbound.departTime);
  const arr = hourOf(it.outbound.arriveTime);
  if (dep === undefined) return 0.7;
  let s = dep < 5 ? 0.35 : dep < 7 ? 0.65 : dep < 21 ? 1 : 0.7;
  if (intent.departTimePrefs.length) {
    const inPref = intent.departTimePrefs.some((p) =>
      p === "morning" ? dep >= 6 && dep < 12 : p === "afternoon" ? dep >= 12 && dep < 17 : p === "evening" ? dep >= 17 && dep < 22 : dep >= 21 || dep < 3,
    );
    s = inPref ? 1 : Math.min(s, 0.6);
  }
  if (arr !== undefined && arr >= 0 && arr < 5) s -= 0.2;
  return clamp01(s);
}

export function rankItineraries(itineraries: Itinerary[], intent: TripIntent): ScoredItinerary[] {
  if (!itineraries.length) return [];
  const w = weightsFor(intent);
  const prices = itineraries.map((i) => i.price).sort((a, b) => a - b);
  const minP = prices[0];
  const p90 = prices[Math.floor((prices.length - 1) * 0.9)];
  const priceSpan = Math.max(p90 - minP, minP * 0.35, 1);
  const fastest = new Map<string, number>();
  for (const it of itineraries) {
    const cur = fastest.get(it.destinationCity);
    if (cur === undefined || it.outbound.durationMin < cur) fastest.set(it.destinationCity, it.outbound.durationMin);
  }
  const cpms = itineraries.filter((i) => i.distanceMiles).map((i) => i.price / i.distanceMiles!).sort((a, b) => a - b);
  const miles = itineraries.map((i) => i.distanceMiles ?? 0).sort((a, b) => a - b);

  const scored = itineraries.map((it): ScoredItinerary => {
    const dur = it.outbound.durationMin || 1;
    // Relative to the fastest option found to the same city, and absolute against a direct flight's rough time.
    let duration = ((fastest.get(it.destinationCity) ?? dur) / dur) ** 1.5;
    if (it.distanceMiles) duration = Math.min(duration, Math.min(1, ((it.distanceMiles / 480) * 60 + 60) / dur) ** 1.5);
    if (intent.maxFlightHours && dur > intent.maxFlightHours * 60) duration *= 0.5;
    const nightsOff = it.nights < intent.tripNightsMin ? intent.tripNightsMin - it.nights : Math.max(0, it.nights - intent.tripNightsMax);
    const b: ScoreBreakdown = {
      price: clamp01(1 - (it.price - minP) / priceSpan),
      duration: clamp01(duration),
      stops: stopsScore(it),
      schedule: scheduleScore(it, intent),
      tripLength: clamp01(1 - nightsOff * 0.2),
      match: matchScore(findDestination(it.destination), intent, monthOf(it.departDate)),
      value: it.distanceMiles ? 1 - percentile(cpms, it.price / it.distanceMiles) : 0.5,
    };
    if (intent.wantsFarAway) {
      // "Far away cheaply": judge the fare against the distance it buys, and reward distance itself.
      b.price = 0.4 * b.price + 0.6 * b.value;
      b.value = 0.4 * b.value + 0.6 * percentile(miles, it.distanceMiles ?? 0);
    }
    let score = (Object.keys(w) as (keyof ScoreBreakdown)[]).reduce((a, k) => a + w[k] * b[k], 0);
    if (intent.budgetMax && it.price > intent.budgetMax) score -= 0.15 + 0.3 * Math.min(1, (it.price - intent.budgetMax) / intent.budgetMax);
    const flightQuality = 0.45 * b.duration + 0.4 * b.stops + 0.15 * b.schedule;
    return { ...it, score: Math.round(score * 1000) / 1000, breakdown: b, flightQuality };
  });
  return scored.sort((a, b) => b.score - a.score || a.price - b.price);
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};

function bestReason(best: ScoredItinerary, cheapest: ScoredItinerary, intent: TripIntent): string {
  if (cheapest.id === best.id) return `Cheapest fare found, with a ${fmtStops(best.outbound.stops).toLowerCase()} ${fmtDuration(best.outbound.durationMin)} flight`;
  const delta = best.price - cheapest.price;
  const faster = cheapest.outbound.durationMin - best.outbound.durationMin;
  const fewerStops = cheapest.outbound.stops - best.outbound.stops;
  if (cheapest.destinationCity === best.destinationCity || intent.destinationMode === "specific") {
    const gains = [faster >= 45 ? `${fmtDuration(faster)} faster` : "", fewerStops > 0 ? `${plural(fewerStops, "fewer stop")}` : ""].filter(Boolean);
    if (gains.length) return `Only ${fmtPrice(delta)} more than the cheapest, ${gains.join(" and ")}`;
  }
  if (intent.destinationMode !== "specific" && best.breakdown.match >= 0.7) return `Great fit for what you asked, ${fmtPrice(delta)} above the cheapest trip`;
  return `Best balance of price, flight and timing — ${fmtPrice(delta)} above the cheapest`;
}

export function pickCategories(ranked: ScoredItinerary[], intent: TripIntent): Category[] {
  if (!ranked.length) return [];
  const best = ranked[0];
  const cats: Category[] = [];
  const used = new Set<string>([best.id]);
  const cheapest = ranked.reduce((a, b) => (b.price < a.price ? b : a));

  cats.push({
    key: "best_overall",
    label: "Best overall",
    emoji: "⭐",
    itineraryId: best.id,
    reason: bestReason(best, cheapest, intent),
  });

  if (!used.has(cheapest.id)) {
    used.add(cheapest.id);
    cats.push({
      key: "cheapest",
      label: "Cheapest",
      emoji: "💰",
      itineraryId: cheapest.id,
      reason: `${fmtPrice(best.price - cheapest.price)} less than the top pick · ${fmtStops(cheapest.outbound.stops)}, ${fmtDuration(cheapest.outbound.durationMin)}`,
    });
  }

  const priceCap = Math.max(cheapest.price * 1.6, intent.budgetMax ?? 0);
  // Best flight is a tradeoff on the same trip: same destination as the top pick.
  const bestFlight = ranked
    .filter((it) => it.id === best.id || (it.price <= priceCap && it.destinationCity === best.destinationCity))
    .reduce((a, b) => (b.flightQuality > a.flightQuality + 0.001 || (Math.abs(b.flightQuality - a.flightQuality) <= 0.001 && b.price < a.price) ? b : a));
  const savesMin = best.outbound.durationMin - bestFlight.outbound.durationMin;
  if (!used.has(bestFlight.id) && (bestFlight.outbound.stops < best.outbound.stops || savesMin >= 90)) {
    used.add(bestFlight.id);
    const delta = bestFlight.price - best.price;
    cats.push({
      key: "best_flight",
      label: "Best flight",
      emoji: "✈️",
      itineraryId: bestFlight.id,
      reason: `${fmtStops(bestFlight.outbound.stops)} · ${fmtDuration(bestFlight.outbound.durationMin)}${savesMin > 30 ? ` — saves ${fmtDuration(savesMin)}` : ""}${delta > 0 ? ` for ${fmtPrice(delta)} more` : delta < 0 ? `, ${fmtPrice(-delta)} cheaper` : ""}`,
    });
  }

  const valueCandidates = ranked.filter((it) => !used.has(it.id) && it.price <= (intent.budgetMax ?? Infinity) * 1.05);
  if (valueCandidates.length) {
    const open = intent.destinationMode !== "specific";
    const bestValue = open
      ? valueCandidates.filter((it) => it.distanceMiles && it.breakdown.match >= 0.4).sort((a, b) => a.price / a.distanceMiles! - b.price / b.distanceMiles!)[0]
      : valueCandidates.sort((a, b) => b.flightQuality / b.price - a.flightQuality / a.price)[0];
    const bestRatio = best.flightQuality / best.price;
    if (bestValue && (open || bestValue.flightQuality / bestValue.price > bestRatio * 1.05)) {
      used.add(bestValue.id);
      cats.push({
        key: "best_value",
        label: "Best value",
        emoji: "💎",
        itineraryId: bestValue.id,
        reason:
          open && bestValue.distanceMiles
            ? `${fmtPrice(bestValue.price)} for ${bestValue.distanceMiles.toLocaleString("en-US")} miles — ${((bestValue.price / bestValue.distanceMiles) * 100).toFixed(1)}¢ a mile`
            : `Strong flight for the money: ${fmtStops(bestValue.outbound.stops)}, ${fmtDuration(bestValue.outbound.durationMin)} at ${fmtPrice(bestValue.price)}`,
      });
    }
  }

  const soonest = ranked
    .filter((it) => it.score >= best.score * 0.8 && it.departDate < best.departDate)
    .sort((a, b) => a.departDate.localeCompare(b.departDate) || b.score - a.score)[0];
  if (soonest && !used.has(soonest.id)) {
    const days = daysBetween(soonest.departDate, best.departDate);
    const delta = soonest.price - best.price;
    cats.push({
      key: "leave_soonest",
      label: "Leave soonest",
      emoji: "⚡",
      itineraryId: soonest.id,
      reason: `Leaves ${formatShort(soonest.departDate)}, ${days} day${days === 1 ? "" : "s"} earlier${delta > 0 ? `, ${fmtPrice(delta)} more` : delta < 0 ? `, ${fmtPrice(-delta)} less` : ""}`,
    });
  }
  return cats;
}

function matchedTags(it: Itinerary, intent: TripIntent): string[] {
  const tags = findDestination(it.destination)?.tags ?? [];
  return intent.interests.filter((t) => tags.includes(t)).slice(0, 2);
}

export function destinationCards(ranked: ScoredItinerary[], intent?: TripIntent): DestinationCard[] {
  const bestPerCity = new Map<string, ScoredItinerary>();
  for (const it of ranked) if (!bestPerCity.has(it.destinationCity)) bestPerCity.set(it.destinationCity, it);
  const picks = [...bestPerCity.values()].slice(0, 8);
  if (picks.length < 2) return [];

  const medianPrice = median(picks.map((p) => p.price));
  const cpm = (p: ScoredItinerary) => (p.distanceMiles ? p.price / p.distanceMiles : Infinity);
  const medianCpm = median(picks.filter((p) => p.distanceMiles).map(cpm));
  const badges = new Map<string, string>();
  const give = (it: ScoredItinerary | undefined, badge: string) => {
    if (it && !badges.has(it.id)) badges.set(it.id, badge);
  };

  give(picks[0], "⭐ Best overall");
  give([...picks].filter((p) => p.breakdown.match >= 0.6).sort((a, b) => a.price - b.price)[0], "💰 Cheapest great option");
  give([...picks].filter((p) => p.price <= medianPrice && p.distanceMiles).sort((a, b) => b.distanceMiles! - a.distanceMiles!)[0], "✈️ Furthest cheap option");
  give([...picks].sort((a, b) => cpm(a) - cpm(b))[0], "🔥 Best fare for the distance");
  const regionSeen = new Set<string>();
  let regionBadges = 0;
  for (const p of picks) {
    const region = findDestination(p.destination)?.region ?? regionForCountry(p.destinationCountry);
    if (!region || regionSeen.has(region)) continue;
    regionSeen.add(region);
    if (!badges.has(p.id) && regionBadges < 2) {
      badges.set(p.id, `🌍 Best ${REGION_LABELS[region]} option`);
      regionBadges++;
    }
  }

  return picks.map((p) => {
    let note: string;
    const range = p.typicalPriceRange;
    if (p.distanceMiles && medianCpm && cpm(p) <= medianCpm * 0.72) note = "Exceptional fare for this distance.";
    else if (range && p.price < range[0]) note = `Below the usual ${fmtPrice(range[0])}–${fmtPrice(range[1])} for this route.`;
    else if (p.outbound.stops === 0) note = `Nonstop, ${fmtDuration(p.outbound.durationMin)}.`;
    else if (p.price <= medianPrice * 0.8) note = `${fmtPrice(medianPrice - p.price)} cheaper than most of these picks.`;
    else if (intent?.interests.length && matchedTags(p, intent).length) note = `Great for ${matchedTags(p, intent).join(" & ")}.`;
    else if (p.breakdown.match >= 0.75) note = "Right up your alley.";
    else if (p.distanceMiles && medianCpm && cpm(p) <= medianCpm) note = "Good fare for how far it is.";
    else note = `${((p.price / (p.distanceMiles || p.price)) * 100).toFixed(1)}¢ a mile.`;
    return {
      code: p.destination,
      city: p.destinationCity,
      country: p.destinationCountry,
      itineraryId: p.id,
      price: p.price,
      nights: p.nights,
      badge: badges.get(p.id) ?? null,
      note,
      distanceMiles: p.distanceMiles,
      stops: p.outbound.stops,
      durationMin: p.outbound.durationMin,
    };
  });
}
