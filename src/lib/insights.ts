import { addDays, daysBetween, formatRange, formatShort, todayISO, weekday, WEEKDAY_NAMES } from "./dates";
import { airportCity } from "./geo";
import { fmtDuration, fmtHoursProse, fmtPrice } from "./format";
import type { DateBucket, DatePoint, Insight, Itinerary, ScoredItinerary } from "./types";

// Every statement produced here is computed directly from collected itineraries.

const MIN_SAVING = 40;

function cheapestBy<K>(items: Itinerary[], key: (it: Itinerary) => K): Map<K, Itinerary> {
  const out = new Map<K, Itinerary>();
  for (const it of items) {
    const k = key(it);
    const cur = out.get(k);
    if (!cur || it.price < cur.price) out.set(k, it);
  }
  return out;
}

const weeksLabel = (n: number) => (n === 1 ? "one week" : n === 2 ? "two weeks" : n === 3 ? "three weeks" : `${n} weeks`);

export function dateBuckets(items: Itinerary[], today = todayISO()): DateBucket[] {
  const byWeek = new Map<number, { min: number; count: number }>();
  for (const it of items) {
    const w = Math.max(0, Math.floor(daysBetween(today, it.departDate) / 7));
    const cur = byWeek.get(w) ?? { min: Infinity, count: 0 };
    cur.min = Math.min(cur.min, it.price);
    cur.count++;
    byWeek.set(w, cur);
  }
  if (byWeek.size < 2) return [];
  const weeks = [...byWeek.keys()].sort((a, b) => a - b);
  const bestMin = Math.min(...[...byWeek.values()].map((v) => v.min));
  // On a tie the soonest week wins: same price, less waiting.
  const bestWeek = weeks.find((w) => byWeek.get(w)!.min === bestMin);
  return weeks.map((w) => {
    const start = addDays(today, w * 7);
    const v = byWeek.get(w)!;
    return {
      label: w === 0 ? "This week" : w === 1 ? "Next week" : `In ${w} weeks`,
      startDate: start,
      minPrice: v.min,
      count: v.count,
      best: w === bestWeek,
    };
  });
}

export function datePoints(items: Itinerary[]): DatePoint[] {
  const points = [...cheapestBy(items, (it) => it.departDate).values()]
    .map((it) => ({ date: it.departDate, minPrice: it.price }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return points.length >= 4 ? points : [];
}

export function computeInsights(focus: Itinerary[], best: ScoredItinerary, buckets: DateBucket[], homeOrigin: string, today = todayISO()): Insight[] {
  const out: Insight[] = [];

  // Timing: waiting vs. going now.
  if (buckets.length >= 2) {
    const first = buckets[0];
    const bestBucket = buckets.find((b) => b.best)!;
    const idx = (b: DateBucket) => buckets.indexOf(b);
    const weeksApart = Math.round(daysBetween(first.startDate, bestBucket.startDate) / 7);
    const saving = first.minPrice - bestBucket.minPrice;
    if (bestBucket !== first && saving >= MIN_SAVING) {
      const text =
        daysBetween(today, first.startDate) < 14
          ? `Waiting ${weeksLabel(weeksApart)} saves ${fmtPrice(saving)} versus leaving ${first.label.toLowerCase()}.`
          : `Leaving the week of ${formatShort(bestBucket.startDate)} instead of ${formatShort(first.startDate)} saves ${fmtPrice(saving)}.`;
      out.push({ kind: "timing", text, savings: saving });
      const after = buckets.slice(idx(bestBucket) + 1);
      if (after.length && Math.min(...after.map((b) => b.minPrice)) - bestBucket.minPrice >= 25) {
        out.push({ kind: "timing", text: `Waiting longer than that doesn't help — later weeks start at ${fmtPrice(Math.min(...after.map((b) => b.minPrice)))}.` });
      }
    } else if (bestBucket === first) {
      const nextMin = Math.min(...buckets.slice(1).map((b) => b.minPrice));
      if (nextMin - first.minPrice >= MIN_SAVING) {
        const when = daysBetween(today, first.startDate) < 14 ? first.label.toLowerCase() : `the week of ${formatShort(first.startDate)}`;
        out.push({ kind: "timing", text: `Going ${when} is cheapest — later weeks cost at least ${fmtPrice(nextMin - first.minPrice)} more.`, savings: nextMin - first.minPrice });
      }
    }
  }

  // Day of week.
  const byWeekday = cheapestBy(focus, (it) => weekday(it.departDate));
  if (byWeekday.size >= 3) {
    const sorted = [...byWeekday.entries()].sort((a, b) => a[1].price - b[1].price);
    const [cheapDay, cheap] = sorted[0];
    const [dearDay, dear] = sorted[sorted.length - 1];
    const saving = dear.price - cheap.price;
    if (saving >= MIN_SAVING) {
      out.push({ kind: "weekday", text: `Leaving on a ${WEEKDAY_NAMES[cheapDay]} instead of a ${WEEKDAY_NAMES[dearDay]} saves ${fmtPrice(saving)}.`, savings: saving });
    }
  }

  // Trip length.
  const byNights = cheapestBy(focus, (it) => it.nights);
  if (byNights.size >= 2) {
    const sorted = [...byNights.entries()].sort((a, b) => a[1].price - b[1].price);
    const [cheapN, cheap] = sorted[0];
    const [dearN, dear] = sorted[sorted.length - 1];
    const saving = dear.price - cheap.price;
    if (saving >= MIN_SAVING) {
      out.push({ kind: "length", text: `${cheapN} nights is ${fmtPrice(saving)} cheaper than ${dearN} nights.`, savings: saving });
    }
  }

  // Nonstop vs connecting.
  const sameDates = focus.filter((it) => it.departDate === best.departDate && it.returnDate === best.returnDate);
  const pool = sameDates.some((it) => it.outbound.stops === 0) && sameDates.some((it) => it.outbound.stops > 0) ? sameDates : focus;
  const nonstop = pool.filter((it) => it.outbound.stops === 0).sort((a, b) => a.price - b.price)[0];
  const connecting = pool.filter((it) => it.outbound.stops > 0).sort((a, b) => a.price - b.price)[0];
  if (nonstop && connecting) {
    const premium = nonstop.price - connecting.price;
    const saved = connecting.outbound.durationMin - nonstop.outbound.durationMin;
    const connLabel = connecting.outbound.stops === 1 ? "one-stop" : `${connecting.outbound.stops}-stop`;
    const scope = pool === sameDates ? " on these dates" : "";
    if (premium <= 0) {
      out.push({ kind: "nonstop", text: `The ${fmtPrice(nonstop.price)} nonstop is cheaper than any connection${scope} — easy call.` });
    } else if (saved >= 120 && premium <= Math.max(110, connecting.price * 0.2)) {
      out.push({ kind: "nonstop", text: `The ${fmtPrice(nonstop.price)} nonstop is probably worth it over the ${fmtPrice(connecting.price)} ${connLabel} — it saves ${fmtHoursProse(saved)} each way.` });
    } else if (saved > 0) {
      out.push({ kind: "nonstop", text: `Nonstop costs ${fmtPrice(premium)} more (${fmtPrice(nonstop.price)} vs ${fmtPrice(connecting.price)}) and saves ${fmtDuration(saved)}.` });
    }
  }

  // Airports: origin and destination alternates.
  const byOrigin = cheapestBy(focus, (it) => it.origin);
  const home = byOrigin.get(homeOrigin);
  if (home && byOrigin.size >= 2) {
    const alt = [...byOrigin.values()].filter((it) => it.origin !== homeOrigin).sort((a, b) => a.price - b.price)[0];
    if (alt && home.price - alt.price >= MIN_SAVING) {
      out.push({ kind: "airport", text: `${alt.origin} is ${fmtPrice(home.price - alt.price)} cheaper than ${homeOrigin} for this trip.`, savings: home.price - alt.price });
    }
  }
  const byDest = cheapestBy(focus, (it) => it.destination);
  if (byDest.size >= 2) {
    const sorted = [...byDest.values()].sort((a, b) => a.price - b.price);
    const saving = sorted[sorted.length - 1].price - sorted[0].price;
    if (saving >= MIN_SAVING) {
      out.push({ kind: "airport", text: `Flying into ${sorted[0].destination} instead of ${sorted[sorted.length - 1].destination} saves ${fmtPrice(saving)}.`, savings: saving });
    }
  }

  // Market context from the provider (real data only).
  if (best.typicalPriceRange) {
    const [lo, hi] = best.typicalPriceRange;
    if (best.price < lo) out.push({ kind: "market", text: `${fmtPrice(best.price)} is below the typical ${fmtPrice(lo)}–${fmtPrice(hi)} for ${airportCity(best.origin)} → ${best.destinationCity}.`, savings: lo - best.price });
    else if (best.priceLevel === "high") out.push({ kind: "market", text: `Prices for these dates are running high versus the usual ${fmtPrice(lo)}–${fmtPrice(hi)}.` });
  }

  const order = { timing: 0, nonstop: 1, weekday: 2, length: 3, airport: 4, market: 5 };
  return out.sort((a, b) => (b.savings ?? 0) - (a.savings ?? 0) || order[a.kind] - order[b.kind]).slice(0, 6);
}

export function describeDates(it: Itinerary): string {
  return formatRange(it.departDate, it.returnDate);
}
