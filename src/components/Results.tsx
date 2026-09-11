"use client";

import { useMemo, useState } from "react";
import { formatRange } from "@/lib/dates";
import { fmtDuration, fmtPrice, fmtStops, fmtTime } from "@/lib/format";
import type { ScoredItinerary, TripIntent, TripResult } from "@/lib/types";
import DateIntel from "./DateIntel";
import FollowUpBar from "./FollowUpBar";
import { ModePill } from "./Home";
import { ArrowLeft, Check, Sparkle } from "./icons";
import ItinerarySheet from "./ItinerarySheet";
import Understood from "./Understood";

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[13px] text-ink-2">{children}</span>;
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3 px-1">
      <h2 className="text-[20px] font-semibold tracking-tight">{title}</h2>
      {sub && <p className="text-[14px] text-ink-3">{sub}</p>}
    </div>
  );
}

function Recommendation({ result, it, onOpen }: { result: TripResult; it: ScoredItinerary; onOpen: () => void }) {
  const { analysis } = result;
  const layover = it.outbound.layovers[0];
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-accent/25 bg-gradient-to-b from-[#16203a] via-surface to-surface p-5 animate-rise">
      <div className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.12em] text-ink-2 uppercase">
            <Sparkle width={14} height={14} className="text-accent" />
            What should I do?
          </div>
          {analysis.by === "rules" && <span className="text-[11px] text-ink-3">rule-based</span>}
        </div>

        <h1 className="mt-3 text-[26px] leading-[1.15] font-semibold tracking-tight">
          <span className={analysis.by === "ai" ? "ai-text" : ""}>{analysis.headline}</span>
        </h1>

        <button onClick={onOpen} className="mt-5 flex w-full items-end justify-between gap-3 text-left">
          <div className="min-w-0">
            <div className="truncate text-[20px] font-semibold">{it.destinationCity}</div>
            <div className="text-[14px] text-ink-2">
              {formatRange(it.departDate, it.returnDate)} · {it.nights} nights
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[48px] leading-none font-semibold tracking-tight">{fmtPrice(it.price)}</div>
            <div className="mt-1 text-[12px] text-ink-3">round trip{it.source === "demo" ? " · demo" : ""}</div>
          </div>
        </button>

        <div className="mt-4 flex flex-wrap gap-1.5">
          <Pill>
            {it.origin} → {it.destination}
          </Pill>
          <Pill>{fmtDuration(it.outbound.durationMin)}</Pill>
          <Pill>
            {fmtStops(it.outbound.stops)}
            {layover ? ` · ${layover.airport} ${fmtDuration(layover.durationMin)}` : ""}
          </Pill>
          <Pill>{it.outbound.airlines.join(" / ")}</Pill>
          <Pill>Departs {fmtTime(it.outbound.departTime)}</Pill>
        </div>

        <p className="mt-5 text-[16px] leading-relaxed text-ink">{analysis.explanation}</p>

        {analysis.whyBetter.length > 0 && (
          <ul className="mt-4 space-y-2">
            {analysis.whyBetter.map((w) => (
              <li key={w} className="flex gap-2.5 text-[15px] leading-snug text-ink-2">
                <Check width={16} height={16} strokeWidth={2.5} className="mt-0.5 shrink-0 text-save" />
                {w}
              </li>
            ))}
          </ul>
        )}

        {analysis.alternativeNote && (
          <p className="mt-4 rounded-2xl bg-white/[0.04] px-4 py-3 text-[14px] leading-snug text-ink-2">{analysis.alternativeNote}</p>
        )}

        <button onClick={onOpen} className="mt-5 h-12 w-full rounded-2xl bg-white text-[16px] font-semibold text-black active:scale-[0.98] transition">
          {it.bookingUrl ? "See flight & book" : "See flight details"}
        </button>
      </div>
    </section>
  );
}

function DestinationRail({ result, byId, onOpen }: { result: TripResult; byId: Map<string, ScoredItinerary>; onOpen: (id: string) => void }) {
  if (!result.destinations.length) return null;
  return (
    <section className="animate-rise [animation-delay:80ms]">
      <SectionTitle title="Where you could go" sub={`Best fare found to each of ${result.destinations.length} top destinations`} />
      <div className="no-scrollbar snap-rail -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {result.destinations.map((d, i) => {
          const it = byId.get(d.itineraryId);
          return (
            <button
              key={d.itineraryId}
              onClick={() => onOpen(d.itineraryId)}
              className={`flex w-[188px] shrink-0 flex-col rounded-3xl border p-4 text-left transition active:scale-[0.98] ${i === 0 ? "border-accent/30 bg-[#141b2e]" : "border-line bg-surface"}`}
            >
              <div className="min-h-[20px] text-[12px] font-medium text-ink-2">{d.badge ?? ""}</div>
              <div className="mt-2 truncate text-[19px] leading-tight font-semibold">{d.city}</div>
              <div className="truncate text-[12px] text-ink-3">
                {d.country}
                {d.distanceMiles ? ` · ${d.distanceMiles.toLocaleString("en-US")} mi` : ""}
              </div>
              <div className="mt-3 text-[34px] leading-none font-semibold tracking-tight">{fmtPrice(d.price)}</div>
              <div className="mt-1.5 text-[13px] whitespace-nowrap text-ink-2">
                {d.nights + 1} days{it ? ` · ${formatRange(it.departDate, it.returnDate)}` : ""}
              </div>
              <div className="mt-2 text-[12px] text-ink-3">
                {fmtStops(d.stops)} · {fmtDuration(d.durationMin)}
              </div>
              <p className="mt-3 text-[13px] leading-snug text-ink italic">&ldquo;{d.note}&rdquo;</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CategoryRail({ result, byId, onOpen }: { result: TripResult; byId: Map<string, ScoredItinerary>; onOpen: (id: string) => void }) {
  const cats = result.categories.filter((c) => byId.has(c.itineraryId));
  if (cats.length < 2) return null;
  const open = result.intent.destinationMode !== "specific";
  return (
    <section className="animate-rise [animation-delay:120ms]">
      <SectionTitle title="The shortlist" sub="Different ways to win" />
      <div className="no-scrollbar snap-rail -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {cats.map((c) => {
          const it = byId.get(c.itineraryId)!;
          return (
            <button
              key={c.key}
              onClick={() => onOpen(c.itineraryId)}
              className="flex w-[236px] shrink-0 flex-col rounded-3xl border border-line bg-surface p-4 text-left transition active:scale-[0.98]"
            >
              <div className="text-[12px] font-semibold tracking-[0.1em] text-ink-2 uppercase">
                {c.emoji} {c.label}
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-2">
                <span className="text-[30px] leading-none font-semibold tracking-tight">{fmtPrice(it.price)}</span>
                <span className="truncate text-[13px] text-ink-3">{open ? it.destinationCity : it.origin + " → " + it.destination}</span>
              </div>
              <div className="mt-2 text-[14px] text-ink-2">
                {formatRange(it.departDate, it.returnDate)} · {it.nights}n
              </div>
              <div className="text-[13px] text-ink-3">
                {fmtStops(it.outbound.stops)} · {fmtDuration(it.outbound.durationMin)} · {it.outbound.airlines[0]}
              </div>
              <p className="mt-3 text-[13px] leading-snug text-ink">{c.reason}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Alternatives({ items, open, onOpen }: { items: ScoredItinerary[]; open: boolean; onOpen: (id: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  if (!items.length) return null;
  const visible = showAll ? items : items.slice(0, 6);
  return (
    <section>
      <SectionTitle title="More strong options" />
      <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
        {visible.map((it) => (
          <li key={it.id}>
            <button onClick={() => onOpen(it.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-raised">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium text-ink">
                  {open ? it.destinationCity : formatRange(it.departDate, it.returnDate)}
                  {open && <span className="font-normal text-ink-3"> · {formatRange(it.departDate, it.returnDate)}</span>}
                </div>
                <div className="truncate text-[13px] text-ink-3">
                  {it.origin} · {fmtStops(it.outbound.stops)} · {fmtDuration(it.outbound.durationMin)} · {it.outbound.airlines[0]} · {it.nights}n
                </div>
              </div>
              <div className="text-[18px] font-semibold tabular-nums">{fmtPrice(it.price)}</div>
            </button>
          </li>
        ))}
      </ul>
      {items.length > 6 && (
        <button onClick={() => setShowAll((s) => !s)} className="mt-2 w-full py-2 text-[14px] text-ink-2">
          {showAll ? "Show fewer" : `Show ${items.length - 6} more`}
        </button>
      )}
    </section>
  );
}

function suggestionsFor(result: TripResult, best: ScoredItinerary | undefined): string[] {
  const i = result.intent;
  if (i.destinationMode === "specific") {
    return ["Only nonstop", "What if I wait another month?", "Make the trip 10 days", "Spend up to $300 more", "I care less about price, more about the flight"];
  }
  const out = [i.scope === "international" ? "Include the US too" : "Okay but only international", "Give me warmer places"];
  if (best) out.push(`Forget ${best.destinationCity}`);
  out.push("What about Europe?", "Only nonstop", "Spend up to $300 more");
  return out;
}

export default function Results(props: {
  result: TripResult;
  onNewSearch: () => void;
  onFollowUp: (text: string) => void;
  onRerun: (intent: TripIntent) => void;
}) {
  const { result, onNewSearch, onFollowUp, onRerun } = props;
  const [sheetId, setSheetId] = useState<string | null>(null);
  const byId = useMemo(() => new Map(result.itineraries.map((i) => [i.id, i])), [result]);
  const recommended = byId.get(result.analysis.recommendedId) ?? result.itineraries[0];
  const open = result.intent.destinationMode !== "specific";

  const featured = new Set([recommended?.id, ...result.categories.map((c) => c.itineraryId), ...result.destinations.map((d) => d.itineraryId)]);
  const alternatives = useMemo(() => {
    const seen = new Set<string>();
    return result.itineraries.filter((it) => {
      if (featured.has(it.id)) return false;
      // One row per destination+dates so the list isn't the same trip five times.
      const key = open ? it.destinationCity : `${it.departDate}-${it.returnDate}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  return (
    <main className="min-h-dvh">
      <div className="mx-auto max-w-md px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-44">
        <header className="sticky top-0 z-30 -mx-4 mb-3 flex items-center justify-between bg-bg/80 px-4 py-2.5 backdrop-blur-xl">
          <button onClick={onNewSearch} className="-ml-2 flex items-center gap-1 rounded-full px-2 py-1.5 text-[15px] text-ink-2 active:scale-95">
            <ArrowLeft width={18} height={18} /> New search
          </button>
          <ModePill status={{ demo: result.demo }} />
        </header>

        <div className="mb-4 px-1">
          <p className="text-[15px] leading-snug text-ink-3">&ldquo;{result.query}&rdquo;</p>
          {result.followUps.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {result.followUps.map((f, i) => (
                <span key={`${f}-${i}`} className="rounded-full bg-accent-soft px-2.5 py-1 text-[12px] text-accent">
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>

        {result.demo && (
          <div className="mb-4 rounded-xl border border-warn/20 bg-warn/[0.06] px-3 py-2 text-[12px] leading-snug text-warn">
            Simulated demo fares — not real prices.
          </div>
        )}

        <div className="space-y-7">
          {recommended && <Recommendation result={result} it={recommended} onOpen={() => setSheetId(recommended.id)} />}

          <Understood key={result.generatedAt} intent={result.intent} by={result.interpretedBy} onRerun={onRerun} />

          {open && <DestinationRail result={result} byId={byId} onOpen={setSheetId} />}
          <CategoryRail result={result} byId={byId} onOpen={setSheetId} />
          <DateIntel city={result.dateFocus} buckets={result.dateBuckets} points={result.datePoints} insights={result.insights} />
          <Alternatives items={alternatives} open={open} onOpen={setSheetId} />

          {result.warnings.map((w) => (
            <p key={w} className="px-1 text-[13px] text-warn">
              {w}
            </p>
          ))}

          <p className="px-1 text-center text-[12px] leading-relaxed text-ink-3">
            Compared {result.stats.itinerariesFound.toLocaleString("en-US")} itineraries
            {open ? ` across ${result.stats.destinationsChecked} destinations` : ""} · {result.stats.providerCalls + result.stats.cacheHits} searches
            {result.stats.cacheHits ? ` (${result.stats.cacheHits} from cache)` : ""} · {result.providerName}
          </p>
        </div>
      </div>

      <FollowUpBar suggestions={suggestionsFor(result, recommended)} onSubmit={onFollowUp} />
      <ItinerarySheet it={sheetId ? byId.get(sheetId) ?? null : null} onClose={() => setSheetId(null)} />
    </main>
  );
}
