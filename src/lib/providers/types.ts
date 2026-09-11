import type { Itinerary, Region, TripIntent } from "../types";

export interface ExploreQuery {
  origin: string;
  outboundDate: string;
  returnDate: string;
  region?: Region;
  maxStops: number | null;
  cabin: TripIntent["cabin"];
}

/** Cheapest known fare to a destination for the given dates (from a discovery search). */
export interface ExploreDestination {
  code: string;
  city: string;
  country: string;
  lat?: number;
  lon?: number;
  price: number;
  departDate: string;
  returnDate: string;
  stops?: number;
  durationMin?: number;
  airline?: string;
}

export interface FlightQuery {
  oneWay?: boolean;
  origins: string[];
  destinations: string[];
  outboundDate: string;
  returnDate: string;
  maxStops: number | null;
  cabin: TripIntent["cabin"];
}

export interface FlightSearchResult {
  itineraries: Itinerary[];
  typicalPriceRange?: [number, number];
  priceLevel?: string;
}

/**
 * The single integration point for flight data. Swap implementations here;
 * everything above this interface only sees normalized Itinerary objects.
 */
export interface FlightProvider {
  name: string;
  demo: boolean;
  explore(q: ExploreQuery): Promise<ExploreDestination[]>;
  searchFlights(q: FlightQuery): Promise<FlightSearchResult>;
}
