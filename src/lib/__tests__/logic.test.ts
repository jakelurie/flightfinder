import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedAmounts, amountsAreGrounded, type AnalysisInput } from "../analyze";
import { addDays } from "../dates";
import { ruleInterpret } from "../heuristic";
import { computeInsights, dateBuckets } from "../insights";
import { normalizeIntent } from "../interpret";
import { serpApiProvider } from "../providers/serpapi";
import { pickCategories, rankItineraries, weightsFor } from "../rank";
import type { Itinerary, TripIntent } from "../types";

const TODAY = "2026-09-10"; // a Thursday
const ORIGINS = ["SFO", "OAK", "SJC"];
const interpret = (q: string) => normalizeIntent(ruleInterpret(q, TODAY, ORIGINS), TODAY, ORIGINS);

function itin(p: Partial<Itinerary> & { price: number; departDate: string }): Itinerary {
  const nights = p.nights ?? 7;
  return {
    id: `${p.origin ?? "SFO"}-${p.destination ?? "HND"}-${p.departDate}-${nights}-${p.price}-${p.outbound?.stops ?? 1}`,
    source: "demo",
    origin: "SFO",
    destination: "HND",
    destinationCity: "Tokyo",
    destinationCountry: "Japan",
    returnDate: addDays(p.departDate, nights),
    nights,
    distanceMiles: 5130,
    ...p,
    outbound: {
      departAirport: p.origin ?? "SFO",
      arriveAirport: p.destination ?? "HND",
      departTime: `${p.departDate} 11:00`,
      arriveTime: `${addDays(p.departDate, 1)} 15:00`,
      durationMin: 720,
      stops: 1,
      layovers: [{ airport: "SEA", durationMin: 90, overnight: false }],
      airlines: ["United"],
      flightNumbers: ["UA 1"],
      ...p.outbound,
    },
  };
}

describe("rule-based interpretation", () => {
  it("fixes a specific destination and window", () => {
    const i = interpret("I specifically want to go to Tokyo sometime in the next four weeks.");
    expect(i.destinationMode).toBe("specific");
    expect(i.destinationAirports).toEqual(["HND", "NRT"]);
    expect(i.latestDeparture).toBe(addDays(TODAY, 28));
  });

  it("reads budget, scope and length", () => {
    const i = interpret("Find me a cool international trip under $800 in the next three weeks for 7-10 days.");
    expect(i.budgetMax).toBe(800);
    expect(i.scope).toBe("international");
    expect([i.tripNightsMin, i.tripNightsMax]).toEqual([6, 9]);
    expect(i.destinationMode).toBe("anywhere");
  });

  it("treats 'next month' as the next calendar month", () => {
    const i = interpret("Cheapest good way to get to Spain for 7-10 days next month.");
    expect(i.earliestDeparture).toBe("2026-10-01");
    expect(i.latestDeparture).toBe("2026-10-31");
    expect(i.priceSensitivity).toBe("high");
  });

  it("detects far-away and vibe requests", () => {
    const i = interpret("Somewhere with beaches and nightlife, preferably outside the US, and don't want horrible flights.");
    expect(i.interests).toEqual(expect.arrayContaining(["beach", "nightlife"]));
    expect(i.flightQualityImportance).toBe("high");
    expect(i.scope).toBe("international");
  });

  it("applies follow-ups as modifications", () => {
    const base = interpret("I want to go to Tokyo in the next four weeks.");
    const apply = (text: string, prev = base, ref?: number) => normalizeIntent(ruleInterpret(text, TODAY, ORIGINS, prev, ref), TODAY, ORIGINS);
    expect(apply("Only nonstop").maxStops).toBe(0);
    const later = apply("What if I wait another month?");
    expect(later.earliestDeparture).toBe(addDays(base.earliestDeparture, 30));
    expect(apply("Make the trip 10 days").tripNightsMin).toBe(9);
    expect(apply("Spend up to $300 more", base, 612).budgetMax).toBe(912);
    const forget = apply("Forget Tokyo");
    expect(forget.destinationMode).toBe("anywhere");
    expect(forget.excludeDestinations).toContain("HND");
    const europe = apply("What about Europe?");
    expect(europe.destinationMode).toBe("region");
    expect(europe.regions).toEqual(["europe"]);
    const quality = apply("I care less about price and more about the flight sucking less");
    expect(quality.priceSensitivity).toBe("low");
    expect(quality.flightQualityImportance).toBe("high");
  });
});

describe("normalizeIntent repairs model output", () => {
  it("keeps valid fields, repairs near-misses, falls back for the rest", () => {
    const fallback = interpret("Tokyo in the next four weeks");
    const messy = {
      ...fallback,
      scope: "International",
      destinationMode: "specific",
      destinationAirports: ["hnd", "nrt", "TOKYO"],
      regions: ["east asia", "atlantis"],
      tripNightsMin: "9",
      tripNightsMax: 6,
      earliestDeparture: "2020-01-01",
      latestDeparture: "not a date",
      priceSensitivity: "very high",
      origins: [],
    };
    const i = normalizeIntent(messy, TODAY, ORIGINS, fallback);
    expect(i.scope).toBe("international");
    expect(i.destinationAirports).toEqual(["HND", "NRT"]);
    expect(i.regions).toEqual(["east_asia"]);
    expect([i.tripNightsMin, i.tripNightsMax]).toEqual([6, 9]);
    expect(i.earliestDeparture).toBe(addDays(TODAY, 1));
    expect(i.latestDeparture >= i.earliestDeparture).toBe(true);
    expect(i.priceSensitivity).toBe(fallback.priceSensitivity);
    expect(i.origins).toEqual(ORIGINS);
  });
});

describe("ranking", () => {
  it("shifts weights with the request", () => {
    const base = interpret("Tokyo next month");
    const cheap = weightsFor({ ...base, priceSensitivity: "extreme" });
    const comfy = weightsFor({ ...base, priceSensitivity: "low", flightQualityImportance: "high" });
    expect(cheap.price).toBeGreaterThan(0.5);
    expect(comfy.duration + comfy.stops).toBeGreaterThan(comfy.price * 3);
  });

  it("picks the cheap one-stop for price hunters and the nonstop for comfort", () => {
    const base: TripIntent = interpret("Tokyo next month");
    const oneStop = itin({ price: 625, departDate: "2026-10-05", outbound: { durationMin: 1020, stops: 1 } as Itinerary["outbound"] });
    const nonstop = itin({ price: 690, departDate: "2026-10-05", outbound: { durationMin: 660, stops: 0, layovers: [] } as unknown as Itinerary["outbound"] });
    const cheapFirst = rankItineraries([oneStop, nonstop], { ...base, priceSensitivity: "extreme", flightQualityImportance: "low" });
    expect(cheapFirst[0].price).toBe(625);
    const comfortFirst = rankItineraries([oneStop, nonstop], { ...base, priceSensitivity: "low", flightQualityImportance: "high" });
    expect(comfortFirst[0].price).toBe(690);
    const cats = pickCategories(comfortFirst, base);
    expect(cats.find((c) => c.key === "cheapest")?.reason).toContain("$65 less");
  });
});

describe("insights are computed from results", () => {
  it("reports timing, weekday, length, nonstop and airport savings", () => {
    const slow = { durationMin: 1020, stops: 1 } as Itinerary["outbound"];
    const items = [
      itin({ price: 840, departDate: "2026-09-11", outbound: slow }), // Fri, this week
      itin({ price: 615, departDate: "2026-09-30", outbound: slow }), // Wed, in 2 weeks
      itin({ price: 799, departDate: "2026-09-25", outbound: slow }), // Fri, in 2 weeks
      itin({ price: 690, departDate: "2026-09-30", outbound: { durationMin: 660, stops: 0, layovers: [] } as unknown as Itinerary["outbound"] }),
      itin({ price: 700, departDate: "2026-10-01", nights: 5, outbound: slow }),
    ];
    const ranked = rankItineraries(items, interpret("Tokyo in the next month"));
    const best = ranked.find((r) => r.price === 615)!;
    const buckets = dateBuckets(items, TODAY);
    expect(buckets.map((b) => [b.label, b.minPrice, b.best])).toEqual([
      ["This week", 840, false],
      ["In 2 weeks", 615, true],
      ["In 3 weeks", 700, false],
    ]);
    const texts = computeInsights(items, best, buckets, "SFO", TODAY).map((i) => i.text);
    expect(texts).toContain("Waiting two weeks saves $225 versus leaving this week.");
    expect(texts).toContain("Leaving on a Wednesday instead of a Friday saves $184.");
    expect(texts).toContain("7 nights is $85 cheaper than 5 nights.");
    expect(texts).toContain("The $690 nonstop is probably worth it over the $615 one-stop — it saves about 6 hours each way.");

    const airports = [itin({ price: 810, departDate: "2026-10-08" }), itin({ price: 700, departDate: "2026-10-08", origin: "OAK" })];
    const bestA = rankItineraries(airports, interpret("Tokyo"))[0];
    expect(computeInsights(airports, bestA, [], "SFO", TODAY).map((i) => i.text)).toContain("OAK is $110 cheaper than SFO for this trip.");
  });
});

describe("analysis grounding guard", () => {
  it("rejects dollar amounts that are not in the results", () => {
    const base = interpret("Tokyo");
    const ranked = rankItineraries([itin({ price: 612, departDate: "2026-09-24" }), itin({ price: 718, departDate: "2026-09-24" })], base);
    const input: AnalysisInput = { query: "", followUps: [], intent: base, ranked, categories: [], insights: [], buckets: [], medianPrice: null, totalItineraries: 2, demo: true };
    const allowed = allowedAmounts(input, ranked);
    expect(amountsAreGrounded(["The $612 fare beats the $718 nonstop by $106."], allowed)).toBe(true);
    expect(amountsAreGrounded(["Fares from $499 are common."], allowed)).toBe(false);
  });
});

describe("SerpApi normalization", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps Google Flights results into itineraries", async () => {
    process.env.SERPAPI_API_KEY = "test";
    const fixture = {
      search_metadata: { google_flights_url: "https://www.google.com/travel/flights?x" },
      best_flights: [
        {
          flights: [
            { departure_airport: { id: "SFO", time: "2026-09-24 11:05" }, arrival_airport: { id: "ICN", time: "2026-09-25 16:20" }, duration: 735, airline: "Korean Air", flight_number: "KE 24" },
            { departure_airport: { id: "ICN", time: "2026-09-25 18:00" }, arrival_airport: { id: "HND", time: "2026-09-25 20:25" }, duration: 145, airline: "Korean Air", flight_number: "KE 2709" },
          ],
          layovers: [{ duration: 100, name: "Incheon", id: "ICN" }],
          total_duration: 980,
          price: 612,
          airline_logo: "https://logo",
        },
      ],
      other_flights: [{ flights: [], price: 500 }],
      price_insights: { lowest_price: 612, price_level: "low", typical_price_range: [700, 950] },
    };
    const fetchMock = vi.fn(async (url: string) => url && new Response(JSON.stringify(fixture), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await serpApiProvider.searchFlights({ origins: ["SFO", "OAK"], destinations: ["HND", "NRT"], outboundDate: "2026-09-24", returnDate: "2026-10-02", maxStops: 1, cabin: "economy" });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("departure_id")).toBe("SFO,OAK");
    expect(url.searchParams.get("stops")).toBe("2");
    expect(res.itineraries).toHaveLength(1);
    const it0 = res.itineraries[0];
    expect(it0).toMatchObject({ price: 612, origin: "SFO", destination: "HND", destinationCity: "Tokyo", nights: 8, source: "serpapi", typicalPriceRange: [700, 950] });
    expect(it0.outbound).toMatchObject({ stops: 1, durationMin: 980, airlines: ["Korean Air"], layovers: [{ airport: "ICN", durationMin: 100, overnight: false }] });
  });
});
