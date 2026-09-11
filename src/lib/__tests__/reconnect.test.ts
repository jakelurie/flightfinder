import { afterEach, expect, it, vi } from 'vitest';
import { startJob, readJob } from '../trip-jobs';
import { streamTrip, pendingTrip } from '../client';
import type { TripResult } from '../types';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('keeps results after a reader disconnects and never duplicates a retried start', async () => {
  const id = crypto.randomUUID();
  let finish!: (r: TripResult) => void;
  const runner = vi.fn(async (_body, emit) => {
    emit({ type: 'progress', stage: 'dates', message: 'Checking flights' });
    return new Promise<TripResult>(resolve => { finish = resolve; });
  });
  startJob(id, {query:'Norway then Galapagos'}, runner);
  expect(readJob(id, 0)?.events).toHaveLength(1);
  startJob(id, {query:'Norway then Galapagos'}, runner);
  expect(runner).toHaveBeenCalledTimes(1);
  finish({query:'Finished'} as TripResult);
  await new Promise(resolve => setTimeout(resolve,0));
  expect(readJob(id,1)).toMatchObject({done:true,cursor:2,events:[{type:'result'}]});
});
it('recovers a dropped start response and polling connection with the same search ID', async () => {
  vi.useFakeTimers();
  const store = new Map<string,string>();
  vi.stubGlobal('sessionStorage',{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v),removeItem:(k:string)=>store.delete(k)});
  const calls: string[]=[];
  let n=0;
  vi.stubGlobal('fetch',vi.fn(async (_url, options) => {
    if(options.body)calls.push(JSON.parse(options.body).searchId);
    n++;
    if(n===1||n===3)throw new TypeError('Load failed');
    return Response.json(n===2?{searchId:calls[0]}:{events:[{type:'error',message:'Fixture complete'}],cursor:1,done:true});
  }));
  const events: string[]=[];
  const done=streamTrip({query:'Norway then Galapagos'}, e=>events.push(e.type));
  await vi.runAllTimersAsync(); await done;
  expect(calls).toHaveLength(2);expect(calls[0]).toBe(calls[1]);
  expect(events.at(-1)).toBe('error');expect(pendingTrip()).toBeNull();
});
