import { distanceBetween, findDestination } from "../geo";
import { REGION_KGMID } from "../geo";
import type { Itinerary, Layover, Leg } from "../types";
import type { ExploreDestination, ExploreQuery, FlightProvider, FlightQuery, FlightSearchResult } from "./types";

// Google Flights + Google Travel Explore via SerpApi (https://serpapi.com).
// Requires SERPAPI_API_KEY. Every call below consumes one SerpApi search credit
// (cached results within SerpApi's own 1h cache are free).

const ENDPOINT = "https://serpapi.com/search.json";
const CLASS = { economy: 1, premium: 2, business: 3, first: 4 } as const;

function stopsParam(maxStops: number | null): number {
  if (maxStops === null) return 0;
  if (maxStops <= 0) return 1;
  if (maxStops === 1) return 2;
  return 3;
}

async function call(params: Record<string, string | number>): Promise<Record<string, unknown>> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new Error("SERPAPI_API_KEY is not set");
  const qs = new URLSearchParams({ hl: "en", gl: "us", currency: "USD", api_key: key });
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const res = await fetch(`${ENDPOINT}?${qs}`, { signal: AbortSignal.timeout(60_000) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const error = typeof json.error === "string" ? json.error : null;
  if (error && /hasn't returned any results|no results/i.test(error)) return {};
  if (!res.ok || error) throw new Error(`SerpApi ${res.status}: ${error ?? res.statusText}`);
  return json;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toLeg(option: any): Leg | null {
  const flights: any[] = option?.flights ?? [];
  if (!flights.length) return null;
  const first = flights[0];
  const last = flights[flights.length - 1];
  const layovers: Layover[] = (option.layovers ?? []).map((l: any) => ({
    airport: l.id ?? l.name ?? "?",
    durationMin: Number(l.duration) || 0,
    overnight: Boolean(l.overnight),
  }));
  return {
    departAirport: first.departure_airport?.id,
    arriveAirport: last.arrival_airport?.id,
    departTime: first.departure_airport?.time,
    arriveTime: last.arrival_airport?.time,
    durationMin: Number(option.total_duration) || flights.reduce((s, f) => s + (Number(f.duration) || 0), 0),
    stops: flights.length - 1,
    layovers,
    airlines: [...new Set(flights.map((f) => f.airline).filter(Boolean))] as string[],
    flightNumbers: flights.map((f) => f.flight_number).filter(Boolean),
    airlineLogo: option.airline_logo ?? first.airline_logo,
  };
}

export const serpApiProvider: FlightProvider = {
  name: "Google Flights via SerpApi",
  demo: false,

  async explore(q: ExploreQuery): Promise<ExploreDestination[]> {
    const params: Record<string, string | number> = {
      engine: "google_travel_explore",
      departure_id: q.origin,
      type: 1,
      outbound_date: q.outboundDate,
      return_date: q.returnDate,
      travel_class: CLASS[q.cabin],
      stops: stopsParam(q.maxStops),
      travel_mode: 1,
    };
    const area = q.region ? REGION_KGMID[q.region] : undefined;
    if (area) params.arrival_area_id = area;
    const json = await call(params);
    const out: ExploreDestination[] = [];
    for (const d of (json.destinations as any[]) ?? []) {
      const code = d?.destination_airport?.code;
      const price = Number(d?.flight_price);
      if (!code || !Number.isFinite(price) || price <= 0) continue;
      out.push({
        code,
        city: d.name ?? findDestination(code)?.city ?? code,
        country: d.country ?? findDestination(code)?.country ?? "",
        lat: d.gps_coordinates?.latitude,
        lon: d.gps_coordinates?.longitude,
        price,
        departDate: d.start_date ?? q.outboundDate,
        returnDate: d.end_date ?? q.returnDate,
        stops: typeof d.number_of_stops === "number" ? d.number_of_stops : undefined,
        durationMin: typeof d.flight_duration === "number" ? d.flight_duration : undefined,
        airline: d.airline,
      });
    }
    return out;
  },

  async searchFlights(q: FlightQuery): Promise<FlightSearchResult> {
    const json = await call({
      engine: "google_flights",
      type: q.oneWay ? 2 : 1,
      departure_id: q.origins.join(","),
      arrival_id: q.destinations.join(","),
      outbound_date: q.outboundDate,
      return_date: q.returnDate,
      travel_class: CLASS[q.cabin],
      stops: stopsParam(q.maxStops),
    });
    const options = [...((json.best_flights as any[]) ?? []), ...((json.other_flights as any[]) ?? [])];
    const insights = json.price_insights as any;
    const typicalPriceRange: [number, number] | undefined =
      Array.isArray(insights?.typical_price_range) && insights.typical_price_range.length === 2
        ? [Number(insights.typical_price_range[0]), Number(insights.typical_price_range[1])]
        : undefined;
    const arrivalInfo = (json.airports as any[])?.[0]?.arrival?.[0];
    const bookingUrl = (json.search_metadata as any)?.google_flights_url;
    const nights = Math.round((Date.parse(q.returnDate) - Date.parse(q.outboundDate)) / 86_400_000);

    const itineraries: Itinerary[] = [];
    for (const opt of options) {
      const leg = toLeg(opt);
      const price = Number(opt?.price);
      if (!leg || !Number.isFinite(price) || price <= 0) continue;
      const catalog = findDestination(leg.arriveAirport);
      itineraries.push({
        id: `sa-${leg.departAirport}-${leg.arriveAirport}-${q.outboundDate}-${q.returnDate}-${leg.flightNumbers.join("_")}`,
        source: "serpapi",
        origin: leg.departAirport,
        destination: leg.arriveAirport,
        destinationCity: catalog?.city ?? arrivalInfo?.city ?? leg.arriveAirport,
        destinationCountry: catalog?.country ?? arrivalInfo?.country ?? "",
        departDate: q.outboundDate,
        returnDate: q.returnDate,
        nights,
        price,
        outbound: leg,
        bookingUrl,
        typicalPriceRange,
        priceLevel: insights?.price_level,
        distanceMiles: distanceBetween(leg.departAirport, leg.arriveAirport),
      });
    }
    return { itineraries, typicalPriceRange, priceLevel: insights?.price_level };
  },
};
