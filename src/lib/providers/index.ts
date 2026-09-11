import { googleFlightsProvider } from "./googleFlights";
import { mockProvider } from "./mock";
import { serpApiProvider } from "./serpapi";
import type { FlightProvider } from "./types";

export type { FlightProvider } from "./types";

/**
 * FLIGHT_PROVIDER = google (default: headless Chrome on Google Flights, no key)
 *                 | serpapi (needs SERPAPI_API_KEY) | demo (simulated fares).
 */
export function getProvider(): FlightProvider {
  const choice = (process.env.FLIGHT_PROVIDER || "google").toLowerCase();
  if (choice === "demo") return mockProvider;
  if (choice === "serpapi") return serpApiProvider;
  return googleFlightsProvider;
}
