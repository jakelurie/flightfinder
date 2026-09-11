import { describe, expect, it } from "vitest";
import { runTrip } from "../pipeline";
import type { StreamEvent } from "../types";

process.env.FLIGHT_PROVIDER = "demo";
process.env.LLM_PROVIDER = "none";

const queries = [
  "Find me somewhere awesome and cheap that I can get pretty far away to in the next two weeks.",
  "I specifically want to go to Tokyo sometime in the next four weeks. Figure out the best dates.",
  "Find me the cheapest good way to get to Spain for 7-10 days next month.",
  "I want somewhere with beaches and nightlife, preferably outside the US, and don't want horrible flights.",
  "Surprise me: somewhere awesome and surprisingly cheap that I can get far away to in the next month.",
  "I have next week off. Where should I go?",
  "What's somewhere surprisingly cheap I could fly far away to soon?",
  "Find me a cool international trip under $800 in the next three weeks.",
];

describe("pipeline smoke (demo)", () => {
  for (const q of queries) {
    it(q, async () => {
      const events: StreamEvent[] = [];
      const result = await runTrip({ query: q }, (e) => events.push(e));
      if (process.env.VERBOSE) console.log(
        "\n" + q,
        "\n intent:", JSON.stringify({ mode: result.intent.destinationMode, dest: result.intent.destinationAirports, regions: result.intent.regions, scope: result.intent.scope, window: [result.intent.earliestDeparture, result.intent.latestDeparture], nights: [result.intent.tripNightsMin, result.intent.tripNightsMax], price: result.intent.priceSensitivity, far: result.intent.wantsFarAway, interests: result.intent.interests }),
        "\n progress:", events.filter((e) => e.type === "progress").map((e) => (e as { message: string }).message),
        "\n analysis:", result.analysis.headline, "—", result.analysis.explanation,
        "\n cats:", result.categories.map((c) => `${c.label}: ${c.reason}`),
        "\n dests:", result.destinations.map((d) => `${d.city} $${d.price} ${d.badge ?? ""} ${d.note}`),
        "\n buckets:", result.dateBuckets.map((b) => `${b.label} $${b.minPrice}${b.best ? "*" : ""}`),
        "\n insights:", result.insights.map((i) => i.text),
        "\n stats:", result.stats,
      );
      expect(result.itineraries.length).toBeGreaterThan(0);
      expect(result.itineraries.some((i) => i.id === result.analysis.recommendedId)).toBe(true);
    });
  }
});
