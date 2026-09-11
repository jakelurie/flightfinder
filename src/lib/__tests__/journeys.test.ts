import { describe, expect, it } from 'vitest';
import { searchJourneys } from '../journeys';
import { baseIntent } from '../heuristic';
import { addDays } from '../dates';
import type { FlightProvider, FlightQuery } from '../providers/types';
import { parseFlight, buildTfs, toPlace } from '../providers/googleFlights';

function provider(failAt?: string) {
 const queries: FlightQuery[]=[];
 const p: FlightProvider={name:`test-${crypto.randomUUID()}`,demo:true,explore:async()=>[],searchFlights:async q=>{
   queries.push(q);
   if(q.destinations[0]===failAt)return {itineraries:[]};
   const arrival=addDays(q.outboundDate,q.origins[0]==='SFO'?1:0);
   return {itineraries:[{id:crypto.randomUUID(),source:'demo',origin:q.origins[0],destination:q.destinations[0],destinationCity:q.destinations[0],destinationCountry:'Japan',departDate:q.outboundDate,returnDate:q.returnDate,nights:0,price:q.oneWay?200:500,outbound:{departAirport:q.origins[0],arriveAirport:q.destinations[0],departTime:`${q.outboundDate} 10:00`,arriveTime:`${arrival} 14:00`,durationMin:240,stops:0,layovers:[],airlines:['Fixture Air'],flightNumbers:[]}}]};
 }};
 return {p,queries};
}
const intent={...baseIntent('2026-09-10',['SFO']),tripType:'multi_city' as const,earliestDeparture:'2026-10-01',latestDeparture:'2026-10-01',routeCandidates:[{reason:'Visit both cities',stops:[{airport:'HND',nights:5},{airport:'ICN',nights:3}],returnHome:true}]};
describe('complete route pricing',()=>{
 it('sums every leg, waits actual local nights, and compares a round trip',async()=>{
   const {p,queries}=provider();
   const r=await searchJourneys({query:'Tokyo and Seoul'},intent,'rules',p,()=>{});
   expect(r.journeys![0].total).toBe(600);
   expect(r.journeys![0].stays.map(s=>s.nights)).toEqual([5,3]);
   expect(queries.slice(0,3).map(q=>q.outboundDate)).toEqual(['2026-10-01','2026-10-07','2026-10-10']);
   expect(queries.slice(0,3).every(q=>q.oneWay)).toBe(true);
   expect(r.journeys![0].baseline?.price).toBe(500);
 });
 it('never displays an incomplete route',async()=>{
   const {p}=provider('ICN');
   await expect(searchJourneys({query:'Tokyo and Seoul'},intent,'rules',p,()=>{})).rejects.toThrow('No complete route');
 });
 it('enforces the total budget rather than per-leg budget',async()=>{
   const {p}=provider();
   await expect(searchJourneys({query:'Tokyo and Seoul'},{...intent,budgetMax:550},'rules',p,()=>{})).rejects.toThrow('No complete route');
 });
 it('applies changed duration limits to cached fares',async()=>{
   const {p}=provider();
   await searchJourneys({query:'Tokyo and Seoul'},intent,'rules',p,()=>{});
   await expect(searchJourneys({query:'Under 3 hours'},{...intent,maxFlightHours:3},'rules',p,()=>{})).rejects.toThrow('No complete route');
 });
 it('one-way never queries or includes a return',async()=>{
   const {p,queries}=provider();
   const r=await searchJourneys({query:'One way Tokyo'},{...intent,tripType:'one_way',routeCandidates:[{reason:'Tokyo',stops:[{airport:'HND',nights:0}],returnHome:false}]},'rules',p,()=>{});
   expect(queries).toHaveLength(1); expect(queries[0].oneWay).toBe(true);
   expect(r.journeys![0].total).toBe(200);expect(r.journeys![0].flights).toHaveLength(1);
 });
 it('rejects round-trip fares in a one-way search',()=>{
   const raw={text:'SFO–HND',label:'From 500 US dollars round trip total. Nonstop flight with United. Leaves San Francisco at 10:00 AM on Thursday, October 1 and arrives at Haneda at 2:00 PM on Friday, October 2. Total duration 12 hr.'};
   const q={outboundDate:'2026-10-01',returnDate:'2026-10-01',oneWay:true};
   expect(parseFlight(raw,q,null,'https://google.com')).toBeNull();
   expect(parseFlight({...raw,label:raw.label.replace(' round trip total','')},q,null,'https://google.com')?.price).toBe(500);
   const tfs=buildTfs({mode:'flights',from:[toPlace('SFO')],to:[toPlace('HND')],...q,maxStops:null,cabin:'economy'});
   expect(Buffer.from(tfs,'base64url').subarray(-3)).toEqual(Buffer.from([0x98,0x01,0x02]));
 });
});
