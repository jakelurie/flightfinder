import { writeFile } from 'node:fs/promises';
const response=await fetch('http://127.0.0.1:4340/api/trip',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'Suggest an interesting multi-city trip from SFO to Japan with a few days in another Asian city, and then fly home. Around 9 nights total, leave October 8 2026. Compare 2 possible routes. Keep flights under 20 hours each.'})});
const events=(await response.text()).trim().split('\n').map(s=>JSON.parse(s));
await writeFile('.logs/route-discovery.json',JSON.stringify(events));
const result=events.find(e=>e.type==='result')?.result;
if(!result?.journeys?.length)throw Error(JSON.stringify(events.at(-1)));
if(result.journeys.some(j=>j.total!==j.flights.reduce((s,f)=>s+f.price,0)||j.flights.some(f=>f.source!=='google'||f.outbound.durationMin>1200)))throw Error('Invalid route fares');
console.log(result.intent.routeCandidates);
console.log(result.journeys.map(j=>({total:j.total,stays:j.stays.map(s=>`${s.city} ${s.nights} nights`)})));
