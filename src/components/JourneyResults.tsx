'use client';
import { useState } from 'react';
import type { Journey, TripResult } from '@/lib/types';
import { fmtPrice, fmtDuration, fmtStops, fmtTime } from '@/lib/format';
import { formatShort, formatRange } from '@/lib/dates';
import { airportCity } from '@/lib/geo';
import FollowUpBar from './FollowUpBar';

function RouteCard({journey:j, demo, best, oneWay}:{journey:Journey;demo:boolean;best:boolean;oneWay:boolean}) {
  return <article className={`rounded-3xl border p-5 ${best?'border-accent/40 bg-gradient-to-b from-[#16203a] to-surface':'border-line bg-surface'}`}>
    <p className="text-xs font-semibold uppercase tracking-widest text-ink-2">{best?'Recommended route':'Another way to go'}{demo?' · DEMO':''}</p>
    <h2 className="mt-3 text-2xl font-semibold">{j.flights.map((f,i)=><span key={i}>{i===0?`${airportCity(f.origin)} → `:''}{airportCity(f.destination)}{i<j.flights.length-1?' → ':''}</span>)}</h2>
    <div className="mt-4 text-5xl font-semibold tracking-tight">{fmtPrice(j.total)}</div>
    <p className="mt-1 text-sm text-ink-2">Total airfare · 1 adult · {oneWay?'one way':'separate tickets'}</p>
    <p className="mt-3 text-sm text-ink-2">{formatRange(j.flights[0].departDate,j.flights.at(-1)!.outbound.arriveTime.slice(0,10))} · {fmtDuration(j.travelMinutes)} flying{j.stays.length?` · ${j.stays.reduce((s,v)=>s+v.nights,0)} nights in cities`:''}</p>
    <p className="mt-4 text-sm leading-relaxed text-ink-2">{j.reason}</p>
    <ol className="mt-5 space-y-3">{j.flights.map((f,i)=><li key={i}>
      <div className="rounded-2xl bg-bg/60 p-4">
        <div className="flex justify-between gap-3 font-semibold"><span>{f.origin} → {f.destination}</span><span>{fmtPrice(f.price)}</span></div>
        <p className="mt-1 text-sm text-ink-2">{formatShort(f.departDate)} · {fmtTime(f.outbound.departTime)} → {fmtTime(f.outbound.arriveTime)}</p>
        <p className="text-xs text-ink-3">Arrives {formatShort(f.outbound.arriveTime.slice(0,10))}, local time</p>
        <p className="mt-2 text-sm">{f.outbound.airlines.join(' / ')} · {fmtStops(f.outbound.stops)} · {fmtDuration(f.outbound.durationMin)}</p>
        {!!f.outbound.layovers.length && <p className="mt-1 text-xs text-ink-2">{f.outbound.layovers.map(l=>`${l.airport}: ${fmtDuration(l.durationMin)}${l.overnight?' overnight':''}`).join(' · ')}</p>}
        {f.bookingUrl && !demo && <a className="mt-3 inline-block text-sm text-accent underline" href={f.bookingUrl} target="_blank" rel="noreferrer">Check this flight on Google Flights ↗</a>}
      </div>
      {j.stays[i] && <div className="ml-4 border-l-2 border-accent/60 py-4 pl-4"><p className="text-lg font-semibold">{j.stays[i].city} · {j.stays[i].nights} nights</p><p className="text-sm text-ink-2">{formatRange(j.stays[i].arrival,j.stays[i].departure)}</p></div>}
    </li>)}</ol>
    <div className="mt-4 flex justify-between border-t border-line pt-4 font-semibold"><span>{j.flights.map(f=>fmtPrice(f.price)).join(' + ')}</span><span>{fmtPrice(j.total)}</span></div>
    {j.baseline && <p className="mt-4 rounded-xl bg-accent-soft p-3 text-sm">Compared with the cheapest {j.baseline.destination} round trip found on these departure/return dates ({fmtPrice(j.baseline.price)}), this route costs {fmtPrice(Math.abs(j.total-j.baseline.price))} {j.total>=j.baseline.price?'more':'less'}. Flight quality and baggage may differ.</p>}
  </article>;
}

export default function JourneyResults({result:r,onNewSearch,onFollowUp}:{result:TripResult;onNewSearch:()=>void;onFollowUp:(s:string)=>void}) {
  const [all,setAll]=useState(false);
  const journeys=r.journeys??[];
  const oneWay=r.intent.tripType==='one_way';
  return <main className="mx-auto min-h-dvh max-w-md px-4 pt-5 pb-44">
    <header className="mb-6 flex justify-between"><button onClick={onNewSearch} className="text-ink-2">← New search</button><span className="text-sm text-accent">{oneWay?'One way':'Multi-city'}{r.demo?' · Demo':''}</span></header>
    <p className="mb-4 text-ink-2">“{r.query}”</p>
    {r.followUps.map((f,i)=><p key={i} className="mb-2 text-sm text-accent">↳ {f}</p>)}
    <details className="mb-5 rounded-2xl border border-line bg-surface p-4"><summary>What I understood</summary><p className="mt-3 text-sm text-ink-2">{r.intent.summary}</p><p className="mt-2 text-sm">Depart {formatRange(r.intent.earliestDeparture,r.intent.latestDeparture)} · {r.intent.origins[0]}{r.intent.maxFlightHours?` · max ${r.intent.maxFlightHours}h per flight`:''}</p><p className="mt-2 text-xs text-ink-3">Change cities, nights, or flight preferences using the message box below.</p></details>
    <p className="mb-4 text-sm text-ink-2">{r.demo?'Simulated demo fares. ':''}Airfare only; hotels, ground transport and optional bags are excluded. {oneWay?'No return included.':'Flights are separate tickets, not a protected through booking. Recheck all legs before buying.'}</p>
    <div className="space-y-6">{(all?journeys:journeys.slice(0,3)).map((j,i)=><RouteCard key={j.id} journey={j} best={i===0} demo={r.demo} oneWay={oneWay}/>)}</div>
    {journeys.length>3&&<button onClick={()=>setAll(!all)} className="my-5 w-full rounded-xl bg-raised p-3">{all?'Show fewer':`Show ${journeys.length-3} more routes`}</button>}
    {r.warnings.map(w=><p key={w} className="mt-4 text-sm text-warn">{w}</p>)}
    <p className="mt-5 text-xs text-ink-3">{journeys.length} complete routes compared · {r.providerName} · checked {new Date(r.generatedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</p>
    <FollowUpBar suggestions={oneWay?['Only nonstop','What if I wait another month?']:['Spend 5 nights in the first city','Suggest a different stopover','Only nonstop','Make it one way']} onSubmit={onFollowUp}/>
  </main>;
}
