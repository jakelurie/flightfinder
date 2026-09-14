'use client';
import { useState } from 'react';
import type { TripResult } from '@/lib/types';
import { findDestination, REGION_LABELS } from '@/lib/geo';
import { formatRange } from '@/lib/dates';
import { fmtPrice, fmtDuration, fmtStops } from '@/lib/format';

export default function DestinationExplorer({result:r,onOpen,onFollowUp}:{result:TripResult;onOpen:(id:string)=>void;onFollowUp:(s:string)=>void}) {
  const [sort,setSort]=useState('recommended');
  const [region,setRegion]=useState('all');
  const [vibe,setVibe]=useState('all');
  const [nonstop,setNonstop]=useState(false);
  const regions=[...new Set(r.destinations.map(d=>findDestination(d.code)?.region).filter(x=>x!==undefined))];
  const tags=['beach','city','nature','food','nightlife'].filter(t=>r.destinations.some(d=>findDestination(d.code)?.tags.some(x=>x===t)));
  const cards=r.destinations.filter(d=>{
    const place=findDestination(d.code);
    return (region==='all'||place?.region===region)&&(vibe==='all'||place?.tags.some(t=>t===vibe))&&(!nonstop||d.stops===0);
  }).sort((a,b)=>sort==='price'?a.price-b.price:sort==='duration'?a.durationMin-b.durationMin:sort==='distance'?(b.distanceMiles??0)-(a.distanceMiles??0):0);
  return <section aria-label="Explore destinations">
    <p className="text-xs uppercase tracking-widest text-accent">Your window. A world of possibilities.</p>
    <h1 className="mt-2 text-3xl font-semibold tracking-tight">Where could you go?</h1>
    <p className="mt-2 text-sm text-ink-2">From {r.intent.origins.join(' / ')} · Depart {formatRange(r.intent.earliestDeparture,r.intent.latestDeparture)}</p>
    <p className="mt-2 text-sm text-ink-3">{r.destinations.length} destinations with flight results. Prices below are for the selected itinerary in each city, round trip per adult{r.demo?' · simulated demo fares':''}.</p>
    <div className="my-4 grid grid-cols-2 gap-2">
      <label className="text-xs text-ink-2">Sort by<select aria-label="Sort destinations" value={sort} onChange={e=>setSort(e.target.value)} className="mt-1 w-full rounded-xl bg-raised p-3 text-sm"><option value="recommended">Recommended</option><option value="price">Lowest price</option><option value="duration">Shortest flight</option><option value="distance">Farthest away</option></select></label>
      <label className="text-xs text-ink-2">Region<select aria-label="Filter region" value={region} onChange={e=>setRegion(e.target.value)} className="mt-1 w-full rounded-xl bg-raised p-3 text-sm"><option value="all">All regions</option>{regions.map(x=><option key={x} value={x}>{REGION_LABELS[x]}</option>)}</select></label>
    </div>
    <div className="mb-4 flex flex-wrap gap-2">{['all',...tags].map(t=><button key={t} aria-pressed={vibe===t} onClick={()=>setVibe(t)} className={`rounded-full px-3 py-2 text-xs capitalize ${vibe===t?'bg-accent text-white':'bg-raised text-ink-2'}`}>{t==='all'?'All styles':t}</button>)}<button aria-pressed={nonstop} onClick={()=>setNonstop(!nonstop)} className={`rounded-full px-3 py-2 text-xs ${nonstop?'bg-accent text-white':'bg-raised text-ink-2'}`}>Nonstop picks</button></div>
    <p aria-live="polite" className="mb-3 text-xs text-ink-3">Showing {cards.length} of {r.destinations.length} · filters apply to these picks</p>
    {!cards.length&&<div className="rounded-2xl bg-surface p-5 text-sm">No picks match these filters. <button className="mt-3 block text-accent" onClick={()=>{setVibe('all');setRegion('all');setNonstop(false);}}>Reset filters</button></div>}
    <div className="grid grid-cols-2 gap-3">{cards.map(d=>{
      const it=r.itineraries.find(i=>i.id===d.itineraryId);
      const place=findDestination(d.code);
      return <article key={d.itineraryId} className="min-w-0 rounded-2xl border border-line bg-surface p-3">
        <button onClick={()=>onOpen(d.itineraryId)} className="w-full text-left" aria-label={`View ${d.city} flights`}>
          {d.itineraryId===r.analysis.recommendedId&&<p className="mb-2 text-xs text-accent">Our top pick</p>}
          <h2 className="break-words text-lg font-semibold leading-tight">{d.city}</h2><p className="mt-1 text-xs text-ink-3">{d.country}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">{fmtPrice(d.price)}</p>
          <p className="mt-2 text-xs text-ink-2">{it&&formatRange(it.departDate,it.returnDate)} · {d.nights} nights</p>
          <p className="mt-2 text-xs text-ink-2">{fmtStops(d.stops)} · {fmtDuration(d.durationMin)}</p>
          <p className="mt-1 text-xs text-ink-3">{it?.origin} → {d.code}</p>
          {place&&<p className="mt-3 text-xs capitalize text-ink-2">{place.tags.slice(0,3).join(' · ')}</p>}
        </button>
        <button className="mt-4 w-full rounded-lg bg-accent-soft px-2 py-3 text-xs text-accent" onClick={()=>onFollowUp(`Focus on ${d.city} (${d.code}). Keep my dates, budget and flight preferences, and find the best options there.`)}>Explore this city →</button>
      </article>;
    })}</div>
  </section>;
}
