import type { Interest, Region } from "./types";

export type Climate = "tropical" | "temperate" | "desert" | "cold";

export interface Destination {
  code: string;
  city: string;
  country: string;
  cc: string;
  region: Region;
  lat: number;
  lon: number;
  climate: Climate;
  tags: Interest[];
  /** Other airports serving the same city. */
  alt?: string[];
}

type Row = [string, string, string, string, Region, number, number, Climate, string, string?];

// code, city, country, cc, region, lat, lon, climate, tags, alternate airports
const ROWS: Row[] = [
  // Europe
  ["LIS", "Lisbon", "Portugal", "PT", "europe", 38.77, -9.13, "temperate", "beach city nightlife food culture"],
  ["OPO", "Porto", "Portugal", "PT", "europe", 41.24, -8.68, "temperate", "city food culture"],
  ["MAD", "Madrid", "Spain", "ES", "europe", 40.47, -3.56, "temperate", "city nightlife food culture"],
  ["BCN", "Barcelona", "Spain", "ES", "europe", 41.3, 2.08, "temperate", "beach city nightlife food"],
  ["AGP", "Málaga", "Spain", "ES", "europe", 36.67, -4.5, "temperate", "beach food"],
  ["CDG", "Paris", "France", "FR", "europe", 49.01, 2.55, "temperate", "city food culture romantic", "ORY"],
  ["LHR", "London", "United Kingdom", "GB", "europe", 51.47, -0.45, "temperate", "city nightlife culture", "LGW"],
  ["DUB", "Dublin", "Ireland", "IE", "europe", 53.42, -6.27, "temperate", "city nightlife"],
  ["AMS", "Amsterdam", "Netherlands", "NL", "europe", 52.31, 4.76, "temperate", "city nightlife culture"],
  ["BER", "Berlin", "Germany", "DE", "europe", 52.36, 13.5, "temperate", "city nightlife culture"],
  ["FCO", "Rome", "Italy", "IT", "europe", 41.8, 12.25, "temperate", "city food culture romantic"],
  ["MXP", "Milan", "Italy", "IT", "europe", 45.63, 8.72, "temperate", "city food"],
  ["ATH", "Athens", "Greece", "GR", "europe", 37.94, 23.94, "temperate", "beach culture food nightlife"],
  ["SPU", "Split", "Croatia", "HR", "europe", 43.54, 16.3, "temperate", "beach nightlife nature"],
  ["PRG", "Prague", "Czechia", "CZ", "europe", 50.1, 14.26, "temperate", "city nightlife culture"],
  ["BUD", "Budapest", "Hungary", "HU", "europe", 47.44, 19.26, "temperate", "city nightlife culture"],
  ["CPH", "Copenhagen", "Denmark", "DK", "europe", 55.62, 12.65, "temperate", "city food"],
  ["KEF", "Reykjavík", "Iceland", "IS", "europe", 63.99, -22.62, "cold", "nature adventure"],
  ["IST", "Istanbul", "Türkiye", "TR", "europe", 41.26, 28.74, "temperate", "city food culture nightlife"],
  ["ZRH", "Zürich", "Switzerland", "CH", "europe", 47.46, 8.55, "temperate", "nature ski city"],
  // Mexico & Central America
  ["MEX", "Mexico City", "Mexico", "MX", "mexico_central_america", 19.44, -99.07, "temperate", "city food culture nightlife"],
  ["CUN", "Cancún", "Mexico", "MX", "mexico_central_america", 21.04, -86.87, "tropical", "tropical beach nightlife"],
  ["PVR", "Puerto Vallarta", "Mexico", "MX", "mexico_central_america", 20.68, -105.25, "tropical", "tropical beach"],
  ["SJD", "Los Cabos", "Mexico", "MX", "mexico_central_america", 23.15, -109.72, "desert", "beach nightlife romantic"],
  ["OAX", "Oaxaca", "Mexico", "MX", "mexico_central_america", 17.0, -96.73, "temperate", "food culture"],
  ["SJO", "San José", "Costa Rica", "CR", "mexico_central_america", 9.99, -84.2, "tropical", "tropical nature adventure"],
  ["LIR", "Guanacaste", "Costa Rica", "CR", "mexico_central_america", 10.59, -85.54, "tropical", "tropical beach nature"],
  ["BZE", "Belize City", "Belize", "BZ", "mexico_central_america", 17.54, -88.31, "tropical", "tropical beach nature adventure"],
  ["GUA", "Guatemala City", "Guatemala", "GT", "mexico_central_america", 14.58, -90.53, "temperate", "culture nature adventure"],
  ["PTY", "Panama City", "Panama", "PA", "mexico_central_america", 9.07, -79.38, "tropical", "tropical city"],
  // Caribbean
  ["SJU", "San Juan", "Puerto Rico", "US", "caribbean", 18.44, -66.0, "tropical", "tropical beach nightlife"],
  ["PUJ", "Punta Cana", "Dominican Republic", "DO", "caribbean", 18.57, -68.36, "tropical", "tropical beach"],
  ["MBJ", "Montego Bay", "Jamaica", "JM", "caribbean", 18.5, -77.91, "tropical", "tropical beach nightlife"],
  ["NAS", "Nassau", "Bahamas", "BS", "caribbean", 25.04, -77.47, "tropical", "tropical beach"],
  ["AUA", "Aruba", "Aruba", "AW", "caribbean", 12.5, -70.01, "tropical", "tropical beach romantic"],
  ["CUR", "Curaçao", "Curaçao", "CW", "caribbean", 12.19, -68.96, "tropical", "tropical beach"],
  // South America
  ["BOG", "Bogotá", "Colombia", "CO", "south_america", 4.7, -74.15, "temperate", "city culture food"],
  ["MDE", "Medellín", "Colombia", "CO", "south_america", 6.16, -75.42, "temperate", "city nightlife nature"],
  ["CTG", "Cartagena", "Colombia", "CO", "south_america", 10.44, -75.51, "tropical", "tropical beach nightlife culture"],
  ["LIM", "Lima", "Peru", "PE", "south_america", -12.02, -77.11, "temperate", "food culture"],
  ["CUZ", "Cusco", "Peru", "PE", "south_america", -13.54, -71.94, "cold", "adventure nature culture"],
  ["UIO", "Quito", "Ecuador", "EC", "south_america", -0.13, -78.36, "temperate", "nature adventure culture"],
  ["EZE", "Buenos Aires", "Argentina", "AR", "south_america", -34.82, -58.54, "temperate", "city nightlife food culture", "AEP"],
  ["GIG", "Rio de Janeiro", "Brazil", "BR", "south_america", -22.81, -43.25, "tropical", "beach nightlife city"],
  ["SCL", "Santiago", "Chile", "CL", "south_america", -33.39, -70.79, "temperate", "city nature food"],
  // East Asia
  ["HND", "Tokyo", "Japan", "JP", "east_asia", 35.55, 139.78, "temperate", "city food culture nightlife", "NRT"],
  ["KIX", "Osaka", "Japan", "JP", "east_asia", 34.43, 135.23, "temperate", "city food culture nightlife"],
  ["ICN", "Seoul", "South Korea", "KR", "east_asia", 37.46, 126.44, "temperate", "city food nightlife culture"],
  ["TPE", "Taipei", "Taiwan", "TW", "east_asia", 25.08, 121.23, "tropical", "city food nightlife nature"],
  ["HKG", "Hong Kong", "Hong Kong", "HK", "east_asia", 22.31, 113.91, "tropical", "city food nightlife"],
  ["PVG", "Shanghai", "China", "CN", "east_asia", 31.14, 121.81, "temperate", "city food"],
  // Southeast Asia
  ["BKK", "Bangkok", "Thailand", "TH", "southeast_asia", 13.69, 100.75, "tropical", "tropical city food nightlife culture", "DMK"],
  ["HKT", "Phuket", "Thailand", "TH", "southeast_asia", 8.11, 98.32, "tropical", "tropical beach nightlife"],
  ["CNX", "Chiang Mai", "Thailand", "TH", "southeast_asia", 18.77, 98.96, "tropical", "nature food culture adventure"],
  ["SGN", "Ho Chi Minh City", "Vietnam", "VN", "southeast_asia", 10.82, 106.65, "tropical", "tropical city food nightlife"],
  ["HAN", "Hanoi", "Vietnam", "VN", "southeast_asia", 21.22, 105.81, "tropical", "food culture adventure"],
  ["DPS", "Bali", "Indonesia", "ID", "southeast_asia", -8.75, 115.17, "tropical", "tropical beach nature nightlife romantic"],
  ["MNL", "Manila", "Philippines", "PH", "southeast_asia", 14.51, 121.02, "tropical", "tropical city"],
  ["CEB", "Cebu", "Philippines", "PH", "southeast_asia", 10.31, 123.98, "tropical", "tropical beach adventure"],
  ["SIN", "Singapore", "Singapore", "SG", "southeast_asia", 1.36, 103.99, "tropical", "tropical city food"],
  ["KUL", "Kuala Lumpur", "Malaysia", "MY", "southeast_asia", 2.74, 101.71, "tropical", "tropical city food"],
  // South Asia
  ["DEL", "Delhi", "India", "IN", "south_asia", 28.56, 77.1, "desert", "culture food"],
  ["BOM", "Mumbai", "India", "IN", "south_asia", 19.09, 72.87, "tropical", "city food nightlife"],
  ["CMB", "Colombo", "Sri Lanka", "LK", "south_asia", 7.18, 79.88, "tropical", "tropical beach nature"],
  ["MLE", "Maldives", "Maldives", "MV", "south_asia", 4.19, 73.53, "tropical", "tropical beach romantic"],
  ["KTM", "Kathmandu", "Nepal", "NP", "south_asia", 27.7, 85.36, "cold", "adventure nature culture"],
  // Middle East
  ["DXB", "Dubai", "United Arab Emirates", "AE", "middle_east", 25.25, 55.36, "desert", "city nightlife beach"],
  ["AMM", "Amman", "Jordan", "JO", "middle_east", 31.72, 35.99, "desert", "culture adventure"],
  ["TLV", "Tel Aviv", "Israel", "IL", "middle_east", 32.01, 34.89, "desert", "beach nightlife food"],
  // Africa
  ["RAK", "Marrakech", "Morocco", "MA", "africa", 31.61, -8.04, "desert", "culture food adventure"],
  ["CAI", "Cairo", "Egypt", "EG", "africa", 30.12, 31.41, "desert", "culture"],
  ["CPT", "Cape Town", "South Africa", "ZA", "africa", -33.97, 18.6, "temperate", "nature beach food adventure"],
  ["NBO", "Nairobi", "Kenya", "KE", "africa", -1.32, 36.93, "temperate", "adventure nature"],
  ["ZNZ", "Zanzibar", "Tanzania", "TZ", "africa", -6.22, 39.22, "tropical", "tropical beach"],
  // Oceania
  ["SYD", "Sydney", "Australia", "AU", "oceania", -33.94, 151.18, "temperate", "beach city nightlife"],
  ["MEL", "Melbourne", "Australia", "AU", "oceania", -37.67, 144.84, "temperate", "city food nightlife"],
  ["AKL", "Auckland", "New Zealand", "NZ", "oceania", -37.01, 174.79, "temperate", "nature adventure"],
  ["NAN", "Fiji", "Fiji", "FJ", "oceania", -17.76, 177.44, "tropical", "tropical beach romantic"],
  ["PPT", "Tahiti", "French Polynesia", "PF", "oceania", -17.55, -149.61, "tropical", "tropical beach romantic"],
  // Hawaii
  ["HNL", "Honolulu", "United States", "US", "hawaii", 21.32, -157.92, "tropical", "tropical beach nightlife nature"],
  ["OGG", "Maui", "United States", "US", "hawaii", 20.9, -156.43, "tropical", "tropical beach nature romantic"],
  ["KOA", "Kona", "United States", "US", "hawaii", 19.74, -156.05, "tropical", "tropical beach nature adventure"],
  // North America
  ["JFK", "New York", "United States", "US", "north_america", 40.64, -73.78, "temperate", "city food nightlife culture", "EWR,LGA"],
  ["MIA", "Miami", "United States", "US", "north_america", 25.8, -80.29, "tropical", "beach nightlife tropical"],
  ["MSY", "New Orleans", "United States", "US", "north_america", 29.99, -90.26, "temperate", "nightlife food culture"],
  ["LAS", "Las Vegas", "United States", "US", "north_america", 36.08, -115.15, "desert", "nightlife"],
  ["AUS", "Austin", "United States", "US", "north_america", 30.19, -97.67, "temperate", "nightlife food"],
  ["DEN", "Denver", "United States", "US", "north_america", 39.86, -104.67, "cold", "nature adventure ski"],
  ["SEA", "Seattle", "United States", "US", "north_america", 47.45, -122.31, "temperate", "city nature food"],
  ["ORD", "Chicago", "United States", "US", "north_america", 41.97, -87.91, "temperate", "city food culture"],
  ["BOS", "Boston", "United States", "US", "north_america", 42.36, -71.01, "temperate", "city culture food"],
  ["SAN", "San Diego", "United States", "US", "north_america", 32.73, -117.19, "temperate", "beach"],
  ["LAX", "Los Angeles", "United States", "US", "north_america", 33.94, -118.41, "temperate", "city beach nightlife food"],
  ["ANC", "Anchorage", "United States", "US", "north_america", 61.17, -149.99, "cold", "nature adventure"],
  ["YVR", "Vancouver", "Canada", "CA", "north_america", 49.19, -123.18, "temperate", "city nature food"],
  ["YUL", "Montréal", "Canada", "CA", "north_america", 45.47, -73.74, "temperate", "city food nightlife culture"],
];

export const DESTINATIONS: Destination[] = ROWS.map(([code, city, country, cc, region, lat, lon, climate, tags, alt]) => ({
  code,
  city,
  country,
  cc,
  region,
  lat,
  lon,
  climate,
  tags: tags.split(" ") as Interest[],
  alt: alt ? alt.split(",") : undefined,
}));

/** Extra airports we only need coordinates for (origins, alternates). */
const EXTRA_AIRPORTS: Record<string, [number, number, string]> = {
  SFO: [37.62, -122.38, "San Francisco"],
  OAK: [37.72, -122.22, "Oakland"],
  SJC: [37.36, -121.93, "San José"],
  SMF: [38.7, -121.59, "Sacramento"],
  BUR: [34.2, -118.36, "Burbank"],
  LGB: [33.82, -118.15, "Long Beach"],
  SNA: [33.68, -117.87, "Orange County"],
  ONT: [34.06, -117.6, "Ontario"],
  PDX: [45.59, -122.6, "Portland"],
  PHX: [33.43, -112.01, "Phoenix"],
  DFW: [32.9, -97.04, "Dallas"],
  DAL: [32.85, -96.85, "Dallas Love"],
  IAH: [29.99, -95.34, "Houston"],
  HOU: [29.65, -95.28, "Houston Hobby"],
  MDW: [41.79, -87.75, "Chicago Midway"],
  ATL: [33.64, -84.43, "Atlanta"],
  FLL: [26.07, -80.15, "Fort Lauderdale"],
  MCO: [28.43, -81.31, "Orlando"],
  EWR: [40.69, -74.17, "Newark"],
  LGA: [40.78, -73.87, "New York LaGuardia"],
  IAD: [38.95, -77.46, "Washington Dulles"],
  DCA: [38.85, -77.04, "Washington National"],
  BWI: [39.18, -76.67, "Baltimore"],
  PHL: [39.87, -75.24, "Philadelphia"],
  MSP: [44.88, -93.22, "Minneapolis"],
  DTW: [42.21, -83.35, "Detroit"],
  SLC: [40.79, -111.98, "Salt Lake City"],
  CLT: [35.21, -80.94, "Charlotte"],
  NRT: [35.77, 140.39, "Tokyo Narita"],
  LGW: [51.15, -0.18, "London Gatwick"],
  ORY: [48.72, 2.38, "Paris Orly"],
  DMK: [13.91, 100.61, "Bangkok Don Mueang"],
  AEP: [-34.56, -58.42, "Buenos Aires Aeroparque"],
  YYZ: [43.68, -79.63, "Toronto"],
};

export const NEARBY_ORIGINS: string[][] = [
  ["SFO", "OAK", "SJC"],
  ["LAX", "BUR", "LGB", "SNA", "ONT"],
  ["JFK", "EWR", "LGA"],
  ["ORD", "MDW"],
  ["IAD", "DCA", "BWI"],
  ["MIA", "FLL"],
  ["DFW", "DAL"],
  ["IAH", "HOU"],
];

const byCode = new Map(DESTINATIONS.map((d) => [d.code, d]));
for (const d of DESTINATIONS) for (const a of d.alt ?? []) if (!byCode.has(a)) byCode.set(a, d);

export function findDestination(code: string): Destination | undefined {
  return byCode.get(code.toUpperCase());
}

const byName = new Map(DESTINATIONS.map((d) => [d.city.toLowerCase(), d]));

/** Match a place name from Google ("New Delhi", "Marrakesh", "Cabo San Lucas") to the catalog. */
export function findDestinationByName(name: string): Destination | undefined {
  const n = name.trim().toLowerCase();
  const direct = byName.get(n) ?? byName.get(n.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  if (direct) return direct;
  const codes = PLACE_ALIASES[n];
  return codes ? findDestination(codes[0]) : undefined;
}

export function airportCoords(code: string): { lat: number; lon: number } | undefined {
  const c = code.toUpperCase();
  const extra = EXTRA_AIRPORTS[c];
  if (extra) return { lat: extra[0], lon: extra[1] };
  const d = byCode.get(c);
  return d ? { lat: d.lat, lon: d.lon } : undefined;
}

export function airportCity(code: string): string {
  const c = code.toUpperCase();
  return EXTRA_AIRPORTS[c]?.[2] ?? byCode.get(c)?.city ?? c;
}

export function haversineMiles(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 3958.8;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function distanceBetween(from: string, to: string): number | undefined {
  const a = airportCoords(from);
  const b = airportCoords(to);
  return a && b ? haversineMiles(a, b) : undefined;
}

export function nearbyAirports(code: string): string[] {
  const group = NEARBY_ORIGINS.find((g) => g.includes(code.toUpperCase()));
  return group ?? [code.toUpperCase()];
}

/** 0..1 — how warm a destination tends to be in a given month (1-12). */
export function warmth(d: Pick<Destination, "climate" | "lat">, month: number): number {
  const southern = d.lat < -10;
  const summer = southern ? [11, 12, 1, 2, 3].includes(month) : [5, 6, 7, 8, 9].includes(month);
  const shoulder = southern ? [4, 10].includes(month) : [4, 10].includes(month);
  switch (d.climate) {
    case "tropical":
      return 1;
    case "desert":
      return summer ? 1 : shoulder ? 0.85 : 0.65;
    case "temperate":
      return summer ? 0.8 : shoulder ? 0.5 : 0.2;
    case "cold":
      return summer ? 0.45 : 0.05;
  }
}

export const REGION_LABELS: Record<Region, string> = {
  north_america: "North America",
  hawaii: "Hawaii",
  mexico_central_america: "Mexico & Central America",
  caribbean: "Caribbean",
  south_america: "South America",
  europe: "Europe",
  east_asia: "East Asia",
  southeast_asia: "Southeast Asia",
  south_asia: "South Asia",
  middle_east: "Middle East",
  africa: "Africa",
  oceania: "Oceania",
};

/** Google place ids for Explore's region filter (each checked against Google Travel Explore). */
export const REGION_KGMID: Partial<Record<Region, string>> = {
  europe: "/m/02j9z",
  southeast_asia: "/m/073q1",
  east_asia: "/m/0j0k", // "Asia"
  south_asia: "/m/0j0k",
  middle_east: "/m/04wsz",
  africa: "/m/0dg3n1",
  south_america: "/m/06n3y",
  caribbean: "/m/0261m",
  mexico_central_america: "/m/0b90_r", // Mexico has far more options than "Central America" (/m/01tzh)
  oceania: "/m/05nrg",
  north_america: "/m/059g4",
};

const COUNTRY_REGION: Record<string, Region> = {
  "United States": "north_america",
  Canada: "north_america",
  Mexico: "mexico_central_america",
  Guatemala: "mexico_central_america",
  Belize: "mexico_central_america",
  "El Salvador": "mexico_central_america",
  Honduras: "mexico_central_america",
  Nicaragua: "mexico_central_america",
  "Costa Rica": "mexico_central_america",
  Panama: "mexico_central_america",
  Japan: "east_asia",
  "South Korea": "east_asia",
  Taiwan: "east_asia",
  China: "east_asia",
  "Hong Kong": "east_asia",
  Mongolia: "east_asia",
  Thailand: "southeast_asia",
  Vietnam: "southeast_asia",
  Indonesia: "southeast_asia",
  Philippines: "southeast_asia",
  Singapore: "southeast_asia",
  Malaysia: "southeast_asia",
  Cambodia: "southeast_asia",
  Laos: "southeast_asia",
  India: "south_asia",
  "Sri Lanka": "south_asia",
  Maldives: "south_asia",
  Nepal: "south_asia",
  "United Arab Emirates": "middle_east",
  Qatar: "middle_east",
  Jordan: "middle_east",
  Israel: "middle_east",
  Oman: "middle_east",
  "Saudi Arabia": "middle_east",
  Morocco: "africa",
  Egypt: "africa",
  "South Africa": "africa",
  Kenya: "africa",
  Tanzania: "africa",
  Ghana: "africa",
  Nigeria: "africa",
  Ethiopia: "africa",
  Australia: "oceania",
  "New Zealand": "oceania",
  Fiji: "oceania",
  "French Polynesia": "oceania",
  Colombia: "south_america",
  Peru: "south_america",
  Ecuador: "south_america",
  Argentina: "south_america",
  Brazil: "south_america",
  Chile: "south_america",
  Uruguay: "south_america",
  Bolivia: "south_america",
  "Puerto Rico": "caribbean",
  "Dominican Republic": "caribbean",
  Jamaica: "caribbean",
  Bahamas: "caribbean",
  Aruba: "caribbean",
  "Curaçao": "caribbean",
  Barbados: "caribbean",
  "Turks and Caicos Islands": "caribbean",
  "Cayman Islands": "caribbean",
};

const EUROPE = new Set(
  "Portugal Spain France United Kingdom Ireland Netherlands Germany Italy Greece Croatia Czechia Hungary Denmark Iceland Türkiye Turkey Switzerland Austria Belgium Poland Norway Sweden Finland Malta Montenegro Albania Romania Bulgaria Slovenia Estonia Latvia Lithuania Serbia Cyprus Luxembourg"
    .split(" "),
);

export function regionForCountry(country: string): Region | undefined {
  if (COUNTRY_REGION[country]) return COUNTRY_REGION[country];
  if (EUROPE.has(country) || country === "United Kingdom" || country === "Czech Republic") return "europe";
  return undefined;
}

/** City / country / region words the rule-based interpreter recognises. */
export const PLACE_ALIASES: Record<string, string[]> = {
  tokyo: ["HND", "NRT"],
  japan: ["HND", "KIX"],
  osaka: ["KIX"],
  kyoto: ["KIX"],
  seoul: ["ICN"],
  korea: ["ICN"],
  taipei: ["TPE"],
  taiwan: ["TPE"],
  "hong kong": ["HKG"],
  bangkok: ["BKK"],
  thailand: ["BKK", "HKT"],
  phuket: ["HKT"],
  bali: ["DPS"],
  vietnam: ["SGN", "HAN"],
  hanoi: ["HAN"],
  singapore: ["SIN"],
  manila: ["MNL"],
  philippines: ["MNL", "CEB"],
  lisbon: ["LIS"],
  portugal: ["LIS", "OPO"],
  porto: ["OPO"],
  spain: ["MAD", "BCN"],
  madrid: ["MAD"],
  barcelona: ["BCN"],
  paris: ["CDG", "ORY"],
  france: ["CDG"],
  london: ["LHR", "LGW"],
  dublin: ["DUB"],
  amsterdam: ["AMS"],
  berlin: ["BER"],
  rome: ["FCO"],
  italy: ["FCO", "MXP"],
  milan: ["MXP"],
  athens: ["ATH"],
  greece: ["ATH"],
  iceland: ["KEF"],
  istanbul: ["IST"],
  prague: ["PRG"],
  budapest: ["BUD"],
  "mexico city": ["MEX"],
  cancun: ["CUN"],
  "cancún": ["CUN"],
  tulum: ["CUN"],
  cabo: ["SJD"],
  "costa rica": ["SJO", "LIR"],
  "puerto rico": ["SJU"],
  "san juan": ["SJU"],
  colombia: ["BOG", "MDE", "CTG"],
  medellin: ["MDE"],
  "medellín": ["MDE"],
  cartagena: ["CTG"],
  peru: ["LIM"],
  lima: ["LIM"],
  "buenos aires": ["EZE"],
  rio: ["GIG"],
  dubai: ["DXB"],
  marrakech: ["RAK"],
  marrakesh: ["RAK"],
  "new delhi": ["DEL"],
  "cabo san lucas": ["SJD"],
  "san jose del cabo": ["SJD"],
  "ho chi minh": ["SGN"],
  saigon: ["SGN"],
  reykjavik: ["KEF"],
  zurich: ["ZRH"],
  malaga: ["AGP"],
  bogota: ["BOG"],
  "montego bay": ["MBJ"],
  "punta cana": ["PUJ"],
  oahu: ["HNL"],
  morocco: ["RAK"],
  "cape town": ["CPT"],
  sydney: ["SYD"],
  australia: ["SYD", "MEL"],
  "new zealand": ["AKL"],
  fiji: ["NAN"],
  hawaii: ["HNL", "OGG"],
  honolulu: ["HNL"],
  maui: ["OGG"],
  "new york": ["JFK", "EWR"],
  nyc: ["JFK", "EWR"],
  miami: ["MIA"],
  "new orleans": ["MSY"],
  vegas: ["LAS"],
  "las vegas": ["LAS"],
  vancouver: ["YVR"],
  montreal: ["YUL"],
  "montréal": ["YUL"],
};

export const REGION_ALIASES: Record<string, Region[]> = {
  europe: ["europe"],
  asia: ["east_asia", "southeast_asia"],
  "southeast asia": ["southeast_asia"],
  "south america": ["south_america"],
  "latin america": ["mexico_central_america", "south_america"],
  "central america": ["mexico_central_america"],
  caribbean: ["caribbean"],
  africa: ["africa"],
  "middle east": ["middle_east"],
  oceania: ["oceania"],
  "south pacific": ["oceania"],
};
