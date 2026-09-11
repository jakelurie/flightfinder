"use client";

import { useEffect } from "react";
import { formatRange, formatShort } from "@/lib/dates";
import { airportCity } from "@/lib/geo";
import { fmtDuration, fmtPrice, fmtStops, fmtTime } from "@/lib/format";
import type { ScoredItinerary } from "@/lib/types";
import { Close, External } from "./icons";

function dayLabel(dateTime: string) {
  const d = dateTime.slice(0, 10);
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function LegTimeline({ it }: { it: ScoredItinerary }) {
  const leg = it.outbound;
  const stops = [leg.departAirport, ...leg.layovers.map((l) => l.airport), leg.arriveAirport];
  return (
    <ol className="relative">
      {stops.map((code, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === stops.length - 1;
        const layover = !isFirst && !isLast ? leg.layovers[idx - 1] : null;
        return (
          <li key={`${code}-${idx}`} className="relative flex gap-3 pb-4 last:pb-0">
            {!isLast && <span className="absolute top-4 left-[5px] h-full w-0.5 bg-line" />}
            <span className={`relative mt-1.5 size-3 shrink-0 rounded-full ring-2 ring-surface ${isFirst || isLast ? "bg-accent" : "bg-muted-bar"}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-medium text-ink">
                  {code} <span className="font-normal text-ink-3">{airportCity(code)}</span>
                </span>
                {isFirst && <span className="text-[15px] tabular-nums text-ink">{fmtTime(leg.departTime)}</span>}
                {isLast && <span className="text-[15px] tabular-nums text-ink">{fmtTime(leg.arriveTime)}</span>}
              </div>
              {isFirst && <div className="text-[13px] text-ink-3">{dayLabel(leg.departTime)}</div>}
              {isLast && <div className="text-[13px] text-ink-3">{dayLabel(leg.arriveTime)} · local time</div>}
              {layover && (
                <div className={`text-[13px] ${layover.durationMin < 55 || layover.overnight ? "text-warn" : "text-ink-3"}`}>
                  {fmtDuration(layover.durationMin)} layover{layover.overnight ? " · overnight" : layover.durationMin < 55 ? " · tight" : ""}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function ItinerarySheet({ it, onClose }: { it: ScoredItinerary | null; onClose: () => void }) {
  useEffect(() => {
    if (!it) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [it, onClose]);

  if (!it) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px] animate-fade" />
      <div className="sheet-in relative max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] border-t border-line bg-surface px-5 pt-3 pb-safe">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[24px] leading-tight font-semibold tracking-tight">{it.destinationCity}</div>
            <div className="text-[14px] text-ink-3">
              {it.destinationCountry} · {formatRange(it.departDate, it.returnDate)} · {it.nights} nights
            </div>
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full bg-raised text-ink-2" aria-label="Close">
            <Close width={16} height={16} />
          </button>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-[40px] leading-none font-semibold tracking-tight">{fmtPrice(it.price)}</div>
            <div className="mt-1 text-[13px] text-ink-3">round trip · 1 adult{it.source === "demo" ? " · demo fare" : ""}</div>
          </div>
          <div className="text-right text-[14px] text-ink-2">
            <div>{fmtStops(it.outbound.stops)}</div>
            <div>{fmtDuration(it.outbound.durationMin)}</div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-raised p-4">
          <div className="mb-3 flex items-center justify-between text-[12px] font-medium tracking-wide text-ink-3 uppercase">
            <span>Outbound</span>
            <span className="normal-case tracking-normal">{it.outbound.airlines.join(" / ")}</span>
          </div>
          <LegTimeline it={it} />
          {it.outbound.flightNumbers.length > 0 && <div className="mt-3 text-[12px] text-ink-3">{it.outbound.flightNumbers.join(" · ")}</div>}
        </div>

        <p className="mt-3 text-[13px] text-ink-3">
          Returning {formatShort(it.returnDate)} — return flights are picked when booking; the price above covers the round trip.
        </p>

        {it.typicalPriceRange && (
          <p className="mt-2 text-[13px] text-ink-3">
            Typical for this route: {fmtPrice(it.typicalPriceRange[0])}–{fmtPrice(it.typicalPriceRange[1])}
            {it.priceLevel ? ` · prices are ${it.priceLevel}` : ""}
          </p>
        )}

        <div className="mt-5 mb-2">
          {it.bookingUrl ? (
            <a
              href={it.bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[16px] font-semibold text-white active:scale-[0.98]"
            >
              Open in Google Flights <External width={16} height={16} />
            </a>
          ) : (
            <div className="rounded-2xl border border-warn/25 bg-warn/10 px-4 py-3 text-center text-[14px] text-warn">
              Demo fare — not a real price and not bookable
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
