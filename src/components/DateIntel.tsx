"use client";

import { useState } from "react";
import { addDays, formatRange, formatShort, parseISO } from "@/lib/dates";
import { fmtPrice } from "@/lib/format";
import type { DateBucket, DatePoint, Insight } from "@/lib/types";

const INSIGHT_ICON: Record<Insight["kind"], string> = {
  timing: "📅",
  weekday: "🗓️",
  length: "🌙",
  nonstop: "✈️",
  airport: "🛫",
  market: "📉",
};

/** Cheapest fare per departure week — a single series; the best week carries the accent and a label. */
function WeekBars({ buckets }: { buckets: DateBucket[] }) {
  const max = Math.max(...buckets.map((b) => b.minPrice));
  const bestPrice = Math.min(...buckets.map((b) => b.minPrice));
  return (
    <ul className="space-y-2" aria-label="Cheapest round trip by departure week">
      {buckets.map((b, i) => (
        <li key={b.startDate} className="grid grid-cols-[92px_1fr_auto] items-center gap-3 animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
          <div className="leading-tight">
            <div className={`text-[14px] ${b.best ? "font-semibold text-ink" : "text-ink-2"}`}>{b.label}</div>
            <div className="text-[11px] text-ink-3">{formatRange(b.startDate, addDays(b.startDate, 6))}</div>
          </div>
          <div className="h-5">
            <div
              className={`h-full rounded-r-[4px] ${b.best ? "bg-accent" : "bg-muted-bar"}`}
              style={{ width: `${Math.max(8, (b.minPrice / max) * 100)}%` }}
            />
          </div>
          <div className="flex min-w-[88px] items-center justify-end gap-1.5">
            <span className={`text-[15px] tabular-nums ${b.best ? "font-semibold text-ink" : "text-ink-2"}`}>{fmtPrice(b.minPrice)}</span>
            {b.best ? (
              <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-accent">BEST</span>
            ) : (
              <span className="w-[38px] text-right text-[11px] tabular-nums text-ink-3">{b.minPrice === bestPrice ? "same" : `+${fmtPrice(b.minPrice - bestPrice)}`}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Cheapest fare by exact departure date, as thin columns. Tap a column for its value. */
function DateColumns({ points }: { points: DatePoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => p.minPrice));
  const min = Math.min(...points.map((p) => p.minPrice));
  const floor = min * 0.75;
  const minIdx = points.findIndex((p) => p.minPrice === min);
  const shown = active ?? minIdx;
  const sel = points[shown];
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-[13px]">
        <span className="text-ink-3">Cheapest by departure date</span>
        <span className="tabular-nums text-ink">
          {parseISO(sel.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })} ·{" "}
          <span className="font-semibold">{fmtPrice(sel.minPrice)}</span>
        </span>
      </div>
      <div className="flex h-24 items-end gap-[2px] border-b border-line" onMouseLeave={() => setActive(null)}>
        {points.map((p, i) => {
          const h = ((p.minPrice - floor) / (max - floor)) * 100;
          return (
            <button
              key={p.date}
              type="button"
              aria-label={`${formatShort(p.date)} ${fmtPrice(p.minPrice)}`}
              onClick={() => setActive(i)}
              onMouseEnter={() => setActive(i)}
              className="flex h-full flex-1 items-end justify-center"
            >
              <span
                className={`block w-full max-w-[24px] rounded-t-[4px] transition-opacity ${i === minIdx ? "bg-accent" : "bg-muted-bar"} ${shown === i ? "opacity-100" : "opacity-70"}`}
                style={{ height: `${Math.max(6, h)}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink-3">
        <span>{formatShort(points[0].date)}</span>
        <span>{formatShort(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}

export default function DateIntel({ city, buckets, points, insights }: { city: string | null; buckets: DateBucket[]; points: DatePoint[]; insights: Insight[] }) {
  if (!buckets.length && !insights.length) return null;
  return (
    <section className="rounded-3xl border border-line bg-surface p-4">
      <h2 className="text-[20px] font-semibold tracking-tight">When to go</h2>
      {city && <p className="mt-0.5 mb-4 text-[14px] text-ink-3">Cheapest round trip to {city}, by departure week</p>}
      {buckets.length > 0 && <WeekBars buckets={buckets} />}
      {points.length > 0 && (
        <div className="mt-6">
          <DateColumns points={points} />
        </div>
      )}
      {insights.length > 0 && (
        <ul className={`${buckets.length ? "mt-5 border-t border-line pt-4" : "mt-3"} space-y-3`}>
          {insights.map((ins) => (
            <li key={ins.text} className="flex gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-raised text-[15px]">{INSIGHT_ICON[ins.kind]}</span>
              <span className="pt-1 text-[15px] leading-snug text-ink">{ins.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
