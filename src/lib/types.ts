import { z } from "zod";

export const REGIONS = [
  "north_america",
  "hawaii",
  "mexico_central_america",
  "caribbean",
  "south_america",
  "europe",
  "east_asia",
  "southeast_asia",
  "south_asia",
  "middle_east",
  "africa",
  "oceania",
] as const;
export type Region = (typeof REGIONS)[number];

export const INTERESTS = [
  "beach",
  "nightlife",
  "city",
  "nature",
  "food",
  "culture",
  "adventure",
  "tropical",
  "ski",
  "romantic",
] as const;
export type Interest = (typeof INTERESTS)[number];

/**
 * Structured interpretation of a natural-language trip request.
 * Every field is required-but-nullable so it works with structured outputs;
 * normalizeIntent() fills sensible defaults afterwards.
 */
export const TripIntentSchema = z.object({
  tripType: z.enum(["round_trip", "one_way", "multi_city"]).optional(),
  routeCandidates: z.array(z.object({
    reason: z.string(),
    stops: z.array(z.object({ airport: z.string(), nights: z.number() })),
    returnHome: z.boolean(),
  })).optional().describe("For multi_city: up to 3 interesting routes, each 2-3 cities in visit order. For one_way: 1 destination per candidate, nights 0, returnHome false. Never invent fares."),
  summary: z.string().describe("One short sentence restating the trip in plain English"),
  origins: z.array(z.string()).describe("Origin IATA airport codes, home airport first"),
  destinationMode: z.enum(["specific", "region", "anywhere"]),
  destinationLabel: z.string().nullable().describe("Human label e.g. 'Tokyo', 'Spain', 'Europe'"),
  destinationAirports: z.array(z.string()).describe("IATA codes when destinationMode is specific"),
  regions: z.array(z.enum(REGIONS)),
  scope: z.enum(["any", "domestic", "international"]),
  earliestDeparture: z.string().describe("YYYY-MM-DD"),
  latestDeparture: z.string().describe("YYYY-MM-DD"),
  tripNightsMin: z.number(),
  tripNightsMax: z.number(),
  budgetMax: z.number().nullable().describe("Max total airfare across all legs in USD per person"),
  cabin: z.enum(["economy", "premium", "business", "first"]),
  maxStops: z.number().nullable().describe("null = any, 0 = nonstop only"),
  preferNonstop: z.boolean(),
  maxFlightHours: z.number().nullable().describe("One-way travel time tolerance in hours"),
  departTimePrefs: z.array(z.enum(["morning", "afternoon", "evening", "redeye"])),
  nearbyAirportsOk: z.boolean(),
  priceSensitivity: z.enum(["low", "medium", "high", "extreme"]),
  flightQualityImportance: z.enum(["low", "medium", "high"]),
  wantsFarAway: z.boolean(),
  interests: z.array(z.enum(INTERESTS)),
  weather: z.enum(["any", "warm", "hot", "mild", "cold"]),
  adventurousness: z.enum(["low", "medium", "high"]),
  excludeDestinations: z.array(z.string()).describe("IATA codes or city names to avoid"),
  assumptions: z.array(z.string()).describe("Short assumptions the user may want to correct"),
});
export type TripIntent = z.infer<typeof TripIntentSchema>;

export interface Layover {
  airport: string;
  durationMin: number;
  overnight: boolean;
}

export interface Leg {
  departAirport: string;
  arriveAirport: string;
  departTime: string; // "YYYY-MM-DD HH:MM" local
  arriveTime: string;
  durationMin: number;
  stops: number;
  layovers: Layover[];
  airlines: string[];
  flightNumbers: string[];
  airlineLogo?: string;
}

export interface Itinerary {
  id: string;
  source: "google" | "serpapi" | "demo";
  origin: string;
  destination: string;
  destinationCity: string;
  destinationCountry: string;
  departDate: string;
  returnDate: string;
  nights: number;
  price: number; // round trip, USD, per person
  outbound: Leg;
  inbound?: Leg;
  bookingUrl?: string;
  typicalPriceRange?: [number, number];
  priceLevel?: string;
  distanceMiles?: number;
}

export interface ScoreBreakdown {
  price: number;
  duration: number;
  stops: number;
  schedule: number;
  tripLength: number;
  match: number;
  value: number;
}

export interface ScoredItinerary extends Itinerary {
  score: number;
  breakdown: ScoreBreakdown;
  flightQuality: number;
}

export type CategoryKey = "best_overall" | "cheapest" | "best_flight" | "best_value" | "leave_soonest";

export interface Category {
  key: CategoryKey;
  label: string;
  emoji: string;
  itineraryId: string;
  reason: string;
}

export interface DestinationCard {
  code: string;
  city: string;
  country: string;
  itineraryId: string;
  price: number;
  nights: number;
  badge: string | null;
  note: string;
  distanceMiles?: number;
  stops: number;
  durationMin: number;
}

export interface DateBucket {
  label: string;
  startDate: string;
  minPrice: number;
  count: number;
  best: boolean;
}

export interface DatePoint {
  date: string;
  minPrice: number;
}

export interface Insight {
  kind: "timing" | "weekday" | "length" | "nonstop" | "airport" | "market";
  text: string;
  savings?: number;
}

export interface Analysis {
  headline: string;
  explanation: string;
  whyBetter: string[];
  alternativeNote: string | null;
  recommendedId: string;
  by: "ai" | "rules";
}

export interface Journey {
  id: string;
  flights: Itinerary[];
  stays: { city: string; airport: string; arrival: string; departure: string; nights: number }[];
  total: number;
  travelMinutes: number;
  reason: string;
  baseline?: { price: number; destination: string; departure: string; returnDate: string; url?: string };
}

export interface TripResult {
  journeys?: Journey[];
  query: string;
  followUps: string[];
  intent: TripIntent;
  interpretedBy: "ai" | "rules";
  demo: boolean;
  providerName: string;
  analysis: Analysis;
  itineraries: ScoredItinerary[]; // top N, ranked
  categories: Category[];
  destinations: DestinationCard[];
  dateFocus: string | null; // city the date intelligence refers to
  dateBuckets: DateBucket[];
  datePoints: DatePoint[];
  insights: Insight[];
  stats: {
    itinerariesFound: number;
    destinationsChecked: number;
    providerCalls: number;
    cacheHits: number;
    medianPrice: number | null;
  };
  warnings: string[];
  generatedAt: string;
}

export type StreamEvent =
  | { type: "progress"; stage: string; message: string }
  | { type: "intent"; intent: TripIntent; interpretedBy: "ai" | "rules" }
  | { type: "result"; result: TripResult }
  | { type: "error"; message: string };

export interface TripRequestBody {
  query: string;
  followUps?: string[];
  followUp?: string;
  previousIntent?: TripIntent;
  intentOverride?: TripIntent;
}
