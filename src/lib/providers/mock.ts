import { addDays, daysBetween, todayISO, weekday } from "../dates";
import { DESTINATIONS, airportCity, airportCoords, distanceBetween, findDestination } from "../geo";
import type { Itinerary, Leg, Region, TripIntent } from "../types";
import type { ExploreDestination, ExploreQuery, FlightProvider, FlightQuery, FlightSearchResult } from "./types";

// DEMO DATA ONLY. Fares here are synthesized from distance, day-of-week, lead time
// and seeded noise so the whole pipeline can be exercised without an API key.
// They are NOT real prices and every itinerary is tagged source: "demo".

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic pseudo-random number in [0, 1). */
function rand(seed: string): number {
  let t = hash(seed) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const between = (seed: string, lo: number, hi: number) => lo + rand(seed) * (hi - lo);

const AIRLINES: Record<Region, [string, string][]> = {
  east_asia: [["United", "UA"], ["ANA", "NH"], ["Japan Airlines", "JL"], ["Korean Air", "KE"], ["EVA Air", "BR"], ["Zipair", "ZG"]],
  southeast_asia: [["EVA Air", "BR"], ["Cathay Pacific", "CX"], ["Singapore Airlines", "SQ"], ["Philippine Airlines", "PR"], ["Starlux", "JX"], ["Korean Air", "KE"]],
  south_asia: [["Emirates", "EK"], ["Qatar Airways", "QR"], ["Air India", "AI"], ["Singapore Airlines", "SQ"]],
  europe: [["United", "UA"], ["TAP Air Portugal", "TP"], ["Iberia", "IB"], ["Air France", "AF"], ["KLM", "KL"], ["British Airways", "BA"], ["Lufthansa", "LH"], ["Aer Lingus", "EI"], ["Icelandair", "FI"]],
  mexico_central_america: [["Alaska", "AS"], ["Aeroméxico", "AM"], ["Volaris", "Y4"], ["United", "UA"], ["Copa", "CM"]],
  caribbean: [["JetBlue", "B6"], ["American", "AA"], ["United", "UA"], ["Delta", "DL"]],
  south_america: [["Avianca", "AV"], ["LATAM", "LA"], ["Copa", "CM"], ["American", "AA"], ["United", "UA"]],
  middle_east: [["Emirates", "EK"], ["Qatar Airways", "QR"], ["Turkish Airlines", "TK"], ["United", "UA"]],
  africa: [["Royal Air Maroc", "AT"], ["Ethiopian", "ET"], ["Turkish Airlines", "TK"], ["Emirates", "EK"], ["Delta", "DL"]],
  oceania: [["Qantas", "QF"], ["Air New Zealand", "NZ"], ["United", "UA"], ["Fiji Airways", "FJ"]],
  hawaii: [["Hawaiian", "HA"], ["Alaska", "AS"], ["United", "UA"], ["Southwest", "WN"]],
  north_america: [["Alaska", "AS"], ["United", "UA"], ["Southwest", "WN"], ["Delta", "DL"], ["JetBlue", "B6"], ["American", "AA"]],
};

const CONNECTIONS: Record<Region, string[]> = {
  east_asia: ["SEA", "LAX", "ICN", "TPE", "YVR"],
  southeast_asia: ["TPE", "HKG", "ICN", "NRT", "MNL"],
  south_asia: ["DXB", "DOH", "SIN", "FRA"],
  europe: ["JFK", "BOS", "KEF", "ORD", "EWR", "DUB"],
  mexico_central_america: ["LAX", "PHX", "IAH", "MEX", "PTY"],
  caribbean: ["MIA", "JFK", "FLL", "IAH", "CLT"],
  south_america: ["MIA", "IAH", "PTY", "BOG", "LIM"],
  middle_east: ["IST", "LHR", "FRA", "JFK"],
  africa: ["CMN", "ADD", "IST", "DXB", "JFK"],
  oceania: ["LAX", "HNL", "NAN", "AKL"],
  hawaii: ["LAX", "SAN", "SEA"],
  north_america: ["DEN", "PHX", "SEA", "ORD", "DFW"],
};

/** Where each foreign carrier actually connects; US carriers use the regional gateways above. */
const AIRLINE_HUB: Record<string, string> = {
  EK: "DXB", QR: "DOH", TK: "IST", ET: "ADD", AT: "CMN", KL: "AMS", AF: "CDG", LH: "FRA", BA: "LHR", IB: "MAD", TP: "LIS",
  FI: "KEF", EI: "DUB", KE: "ICN", BR: "TPE", JX: "TPE", CX: "HKG", SQ: "SIN", JL: "NRT", NH: "NRT", PR: "MNL", CM: "PTY",
  AV: "BOG", LA: "LIM", AM: "MEX", Y4: "GDL", FJ: "NAN", NZ: "AKL", QF: "SYD", AI: "DEL", ZG: "NRT",
};

const HUB_ORIGINS = new Set(["SFO", "LAX", "JFK", "EWR", "ORD", "SEA", "IAD", "BOS", "MIA", "DFW", "IAH", "ATL", "DEN"]);
const NONSTOP_DESTS = new Set(
  "HND NRT KIX ICN TPE HKG PVG SIN MNL LHR CDG AMS MAD BCN LIS DUB FCO ZRH CPH IST DXB SYD AKL MEX CUN SJD PVR SJO LIR HNL OGG KOA JFK MIA BOS ORD SEA DEN LAS AUS MSY SAN LAX YVR YUL KEF TLV DEL BOM NAN PTY BOG LIM".split(" "),
);
const WEEKDAY_FACTOR = [1.08, 1.0, 0.93, 0.9, 0.98, 1.1, 1.03];

function regionOf(code: string): Region {
  return findDestination(code)?.region ?? "north_america";
}

/** Base round-trip economy fare for a route and dates (before per-option variation). */
function baseFare(origin: string, dest: string, depart: string, ret: string, cabin: TripIntent["cabin"]): number {
  const miles = distanceBetween(origin, dest) ?? 2500;
  const slope = miles > 6000 ? 6000 * 0.085 + (miles - 6000) * 0.05 : miles * 0.085;
  let fare = 150 + slope * 1.15;
  const destKey = findDestination(dest)?.city ?? dest;
  fare *= between(`route:${destKey}`, 0.78, 1.25); // some places are surprisingly cheap
  fare *= between(`origin:${origin}`, 0.9, 1.06);
  const week = Math.floor(daysBetween("2026-01-05", depart) / 7);
  fare *= between(`week:${destKey}:${week}`, 0.86, 1.2); // sweet-spot weeks
  fare *= WEEKDAY_FACTOR[weekday(depart)];
  if (weekday(ret) === 0) fare *= 1.05;
  const lead = daysBetween(todayISO(), depart);
  fare *= lead < 7 ? 1.3 : lead < 14 ? 1.12 : lead < 45 ? 1.0 : 0.97;
  const nights = daysBetween(depart, ret);
  fare *= nights < 4 ? 1.08 : nights < 7 ? 1.03 : nights <= 10 ? 0.95 : 1.0;
  fare *= { economy: 1, premium: 1.7, business: 3.6, first: 5.5 }[cabin];
  return fare;
}

/** Rough local-time shift from longitude (demo only), including the date line. */
function tzShiftMin(origin: string, dest: string): number {
  const a = airportCoords(origin);
  const b = airportCoords(dest);
  if (!a || !b) return 0;
  const raw = b.lon - a.lon;
  const hours = raw > 180 ? (raw - 360) / 15 + 24 : raw < -180 ? (raw + 360) / 15 - 24 : raw / 15;
  return Math.round(hours) * 60;
}

function clock(date: string, minutes: number): string {
  const day = Math.floor(minutes / 1440);
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${addDays(date, day)} ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function routeOptions(origin: string, dest: string, q: FlightQuery): Itinerary[] {
  const miles = distanceBetween(origin, dest) ?? 2500;
  const region = regionOf(dest);
  const airlines = AIRLINES[region];
  const base = baseFare(origin, dest, q.outboundDate, q.returnDate, q.cabin);
  const seed = `${origin}-${dest}-${q.outboundDate}-${q.returnDate}`;
  const directMin = Math.round((miles / 490) * 60 + 35);
  const nonstopExists = HUB_ORIGINS.has(origin) && (NONSTOP_DESTS.has(dest) || miles < 2500) && rand(`ns:${origin}-${dest}`) > 0.3;
  const destInfo = findDestination(dest);
  const out: Itinerary[] = [];
  const hours = [6, 7, 9, 10, 11, 13, 15, 17, 19, 22, 23];

  const make = (kind: string, stops: number, priceMult: number, i: number) => {
    const s = `${seed}:${kind}:${i}`;
    const [airline, code] = airlines[Math.floor(rand(`${s}:al`) * airlines.length)];
    const departMin = hours[Math.floor(rand(`${s}:hr`) * hours.length)] * 60 + (rand(`${s}:mm`) > 0.5 ? 30 : 5);
    const layovers = Array.from({ length: stops }, (_, k) => {
      const hubs = CONNECTIONS[region].filter((h) => h !== origin && h !== dest);
      const own = AIRLINE_HUB[code];
      const hub = k === 0 && own && own !== origin && own !== dest ? own : hubs[Math.floor(rand(`${s}:hub${k}`) * hubs.length)] ?? "DEN";
      const durationMin = Math.round(between(`${s}:lay${k}`, 45, 330) / 5) * 5;
      return { airport: hub, durationMin, overnight: durationMin > 300 };
    });
    const detour = stops === 0 ? 1 : between(`${s}:detour`, 1.06, 1.22) + (stops - 1) * 0.08;
    const durationMin = Math.round(directMin * detour + layovers.reduce((a, l) => a + l.durationMin, 0));
    const leg: Leg = {
      departAirport: origin,
      arriveAirport: dest,
      departTime: clock(q.outboundDate, departMin),
      arriveTime: clock(q.outboundDate, departMin + durationMin + tzShiftMin(origin, dest)),
      durationMin,
      stops,
      layovers,
      airlines: [airline],
      flightNumbers: Array.from({ length: stops + 1 }, (_, k) => `${code} ${100 + Math.floor(rand(`${s}:fn${k}`) * 1800)}`),
    };
    const price = Math.max(79, Math.round(base * priceMult * between(`${s}:p`, 0.96, 1.06)));
    out.push({
      id: `demo-${origin}-${dest}-${q.outboundDate}-${q.returnDate}-${kind}${i}`,
      source: "demo",
      origin,
      destination: dest,
      destinationCity: destInfo?.city ?? airportCity(dest),
      destinationCountry: destInfo?.country ?? "",
      departDate: q.outboundDate,
      returnDate: q.returnDate,
      nights: daysBetween(q.outboundDate, q.returnDate),
      price,
      outbound: leg,
      distanceMiles: miles,
    });
  };

  if (nonstopExists) {
    make("ns", 0, between(`${seed}:nsprem`, 1.08, 1.28), 0);
    if (rand(`${seed}:ns2`) > 0.5) make("ns", 0, between(`${seed}:nsprem2`, 1.15, 1.4), 1);
  }
  if (q.maxStops === null || q.maxStops >= 1) {
    for (let i = 0; i < 3; i++) make("1s", 1, between(`${seed}:1s${i}`, 0.9, 1.08), i);
  }
  if (miles > 1500 && (q.maxStops === null || q.maxStops >= 2)) make("2s", 2, between(`${seed}:2s`, 0.8, 0.92), 0);
  if (!out.length && q.maxStops === 0 && miles < 7500) make("ns", 0, 1.3, 0);
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mockProvider: FlightProvider = {
  name: "Demo data",
  demo: true,

  async explore(q: ExploreQuery): Promise<ExploreDestination[]> {
    await sleep(500 + Math.random() * 500);
    const out: ExploreDestination[] = [];
    for (const d of DESTINATIONS) {
      if (q.region && d.region !== q.region) continue;
      if ((distanceBetween(q.origin, d.code) ?? 0) < 150) continue;
      const opts = routeOptions(q.origin, d.code, {
        origins: [q.origin],
        destinations: [d.code],
        outboundDate: q.outboundDate,
        returnDate: q.returnDate,
        maxStops: q.maxStops,
        cabin: q.cabin,
      });
      if (!opts.length) continue;
      const cheapest = opts.reduce((a, b) => (b.price < a.price ? b : a));
      out.push({
        code: d.code,
        city: d.city,
        country: d.country,
        lat: d.lat,
        lon: d.lon,
        price: cheapest.price,
        departDate: q.outboundDate,
        returnDate: q.returnDate,
        stops: cheapest.outbound.stops,
        durationMin: cheapest.outbound.durationMin,
        airline: cheapest.outbound.airlines[0],
      });
    }
    return out;
  },

  async searchFlights(q: FlightQuery): Promise<FlightSearchResult> {
    await sleep(250 + Math.random() * 350);
    const itineraries = q.origins.flatMap((o) =>
      q.destinations.filter((d) => d !== o).flatMap((d) => routeOptions(o, d, q)),
    );
    const filtered = itineraries.filter((it) => q.maxStops === null || it.outbound.stops <= q.maxStops);
    return { itineraries: filtered.map(it => q.oneWay ? { ...it, price: Math.round(it.price * 0.58) } : it).sort((a, b) => a.price - b.price) };
  },
};
