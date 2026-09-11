import { addDays, spreadDates } from './dates';
import { cacheGet, cacheSet } from './cache';
import { airportCity } from './geo';
import type { FlightProvider, FlightQuery } from './providers/types';
import type { Itinerary, Journey, TripIntent, TripRequestBody, TripResult } from './types';

export function validFlight(it: Itinerary, intent: TripIntent, date: string) {
  return Number.isFinite(it.price) && it.price > 0 && it.outbound.durationMin > 0 &&
    it.outbound.departTime.slice(0, 10) === date &&
    (intent.maxStops === null || it.outbound.stops <= intent.maxStops) &&
    (!intent.maxFlightHours || it.outbound.durationMin <= intent.maxFlightHours * 60);
}

export function totalAirfare(flights: Itinerary[]) { return flights.reduce((sum, it) => sum + it.price, 0); }

export async function searchJourneys(body: TripRequestBody, intent: TripIntent, by: 'ai' | 'rules', provider: FlightProvider,
  progress: (stage: string, message: string) => void): Promise<TripResult> {
  const oneWay = intent.tripType === 'one_way';
  const candidates = (intent.routeCandidates?.length ? intent.routeCandidates : oneWay ? intent.destinationAirports.map(airport => ({ stops: [{airport, nights: 0}], reason: 'Your requested destination.', returnHome: false })) : []).slice(0, 3);
  if (!candidates.length) throw new Error('Could not plan that route. Name a destination or ask for a multi-city route with a region and approximate length.');
  for (const c of candidates) {
    if (!c.stops.length || c.stops.length > 3 || (!oneWay && c.stops.length < 2) || (oneWay && c.stops.length !== 1) ||
      c.stops.some(s => !/^[A-Z]{3}$/.test(s.airport) || !Number.isInteger(s.nights) || s.nights < (oneWay ? 0 : 1) || s.nights > 30) ||
      new Set(c.stops.map(s => s.airport)).size !== c.stops.length) throw new Error('The proposed route was invalid. Try stating the cities and nights in each.');
  }
  let calls = 0, hits = 0;
  const cap = Math.min(40, Math.max(1, Number(process.env.SEARCH_MAX_PROVIDER_CALLS) || 30));
  const warnings = new Set<string>();
  const local = new Map<string, Itinerary[]>();
  async function query(q: FlightQuery): Promise<Itinerary[]> {
    const key = { version: 'journeys-v2', provider: provider.name, ...q };
    const id = JSON.stringify(key);
    if (local.has(id)) return local.get(id)!.filter(it=>validFlight(it,intent,q.outboundDate));
    const cached = await cacheGet<Itinerary[]>('journeys', key);
    if (cached) { hits++; local.set(id,cached); return cached.filter(it=>validFlight(it,intent,q.outboundDate)); }
    if (calls >= cap) { warnings.add('Request limit reached; only fully priced routes are shown.'); return []; }
    calls++;
    try {
      const found = (await provider.searchFlights(q)).itineraries;
      await cacheSet('journeys', key, found);
      local.set(id,found);
      return found.filter(it=>validFlight(it,intent,q.outboundDate));
    } catch { warnings.add('Some flight searches failed; incomplete routes were excluded.'); return []; }
  }
  const journeys: Journey[] = [];
  const dates = spreadDates(intent.earliestDeparture,intent.latestDeparture,3);
  progress('candidates', `Comparing ${candidates.length} routes across ${dates.length} departure dates…`);
  // Sequential legs: each next departure depends on the actual arrival date, including date-line crossings.
  for (const c of candidates) for (const start of dates) {
    let from = intent.origins[0], date = start;
    const flights: Itinerary[] = [], stays: Journey['stays'] = [];
    const stops = [...c.stops];
    if (!oneWay && c.returnHome) stops.push({airport: intent.origins[0], nights: 0});
    for (const [index, stop] of stops.entries()) {
      progress('dates', `Checking ${from} → ${stop.airport} on ${date}…`);
      const found = await query({origins:[from],destinations:[stop.airport],outboundDate:date,returnDate:date,oneWay:true,maxStops:intent.maxStops,cabin:intent.cabin});
      const cheapest = Math.min(...found.map(it => it.price));
      // Dollar-equivalent comfort penalty, understandable and consistent across legs.
      const comfort = intent.priceSensitivity === 'extreme' ? 0 : intent.flightQualityImportance === 'high' ? 30 : 10;
      found.sort((a,b) => (a.price + a.outbound.durationMin / 60 * comfort + a.outbound.stops * comfort) - (b.price + b.outbound.durationMin / 60 * comfort + b.outbound.stops * comfort));
      const flight = found[0];
      if (!flight || !Number.isFinite(cheapest)) break;
      flights.push(flight);
      const arrival = flight.outbound.arriveTime.slice(0,10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(arrival)) break;
      if (index < c.stops.length && !oneWay) {
        date = addDays(arrival,stop.nights);
        stays.push({city:airportCity(stop.airport),airport:stop.airport,arrival,departure:date,nights:stop.nights});
      }
      from = stop.airport;
    }
    if (flights.length !== stops.length || (!oneWay && stays.length !== c.stops.length)) continue;
    const total = totalAirfare(flights);
    if (intent.budgetMax && total > intent.budgetMax) continue;
    const journey: Journey = {id:flights.map(f=>f.id).join(':'),flights,stays,total,travelMinutes:flights.reduce((s,f)=>s+f.outbound.durationMin,0),reason:c.reason};
    if (!oneWay && c.returnHome && calls < cap) {
      const returnDate = flights.at(-1)!.departDate;
      const baseline = await query({origins:[intent.origins[0]],destinations:[c.stops[0].airport],outboundDate:start,returnDate,oneWay:false,maxStops:intent.maxStops,cabin:intent.cabin});
      baseline.sort((a,b)=>a.price-b.price);
      if (baseline[0]) journey.baseline = {price:baseline[0].price,destination:airportCity(c.stops[0].airport),departure:start,returnDate,url:baseline[0].bookingUrl};
    }
    journeys.push(journey);
  }
  if (!journeys.length) throw new Error('No complete route matched the budget and flight limits. Widen the dates or budget, or simplify the route.');
  const comfort = intent.priceSensitivity === 'extreme' ? 0 : intent.flightQualityImportance === 'high' ? 30 : 10;
  journeys.sort((a,b)=>(a.total+a.travelMinutes/60*comfort)-(b.total+b.travelMinutes/60*comfort));
  progress('rank', `Comparing ${journeys.length} complete, priced routes…`);
  const best = journeys[0];
  const label = best.flights.map(f=>airportCity(f.destination)).join(' → ');
  const explanation = `${oneWay ? 'One-way flight' : 'Complete route'} from ${best.flights[0].origin}: $${best.total.toLocaleString('en-US')} total airfare for one adult. ${oneWay ? 'No return flight included.' : `${best.stays.reduce((s,v)=>s+v.nights,0)} nights across ${best.stays.length} cities. Each flight is a separate ticket.`}`;
  return {query:body.query,followUps:body.followUp?[...(body.followUps??[]),body.followUp]:body.followUps??[],intent,interpretedBy:by,demo:provider.demo,providerName:provider.name,journeys,
    analysis:{headline:label,explanation,whyBetter:[],alternativeNote:null,recommendedId:best.id,by:'rules'},
    itineraries:[],categories:[],destinations:[],dateFocus:null,dateBuckets:[],datePoints:[],insights:[],
    stats:{itinerariesFound:journeys.length,destinationsChecked:new Set(journeys.flatMap(j=>j.flights.map(f=>f.destination))).size,providerCalls:calls,cacheHits:hits,medianPrice:journeys[Math.floor(journeys.length/2)].total},warnings:[...warnings],generatedAt:new Date().toISOString()};
}
