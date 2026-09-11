"use client";

import { useState } from "react";
import { formatRange } from "@/lib/dates";
import { REGION_LABELS } from "@/lib/geo";
import type { TripIntent } from "@/lib/types";
import { Chevron, Pencil } from "./icons";

function chips(i: TripIntent): string[] {
  const where =
    i.destinationMode === "specific"
      ? `${i.destinationLabel ?? i.destinationAirports.join(" / ")}`
      : i.destinationMode === "region"
        ? i.regions.map((r) => REGION_LABELS[r]).join(", ")
        : i.scope === "international"
          ? "Anywhere international"
          : i.scope === "domestic"
            ? "Anywhere in the US"
            : "Anywhere";
  const out = [
    `From ${i.origins.join(" · ")}`,
    `To ${where}`,
    `Leave ${formatRange(i.earliestDeparture, i.latestDeparture)}`,
    i.tripNightsMin === i.tripNightsMax ? `${i.tripNightsMin} nights` : `${i.tripNightsMin}–${i.tripNightsMax} nights`,
  ];
  if (i.budgetMax) out.push(`Under $${i.budgetMax.toLocaleString("en-US")}`);
  out.push(
    { extreme: "Cheapest possible", high: "Price matters a lot", medium: "Balanced price & comfort", low: "Comfort over price" }[i.priceSensitivity],
  );
  if (i.maxStops === 0) out.push("Nonstop only");
  else if (i.maxStops !== null) out.push(`≤ ${i.maxStops} stop${i.maxStops === 1 ? "" : "s"}`);
  else if (i.preferNonstop) out.push("Prefer nonstop");
  if (i.flightQualityImportance === "high" && i.maxStops !== 0) out.push("Good flights matter");
  if (i.wantsFarAway) out.push("Far away");
  if (i.interests.length) out.push(i.interests.join(", "));
  if (i.weather !== "any") out.push(`${i.weather[0].toUpperCase()}${i.weather.slice(1)} weather`);
  if (i.cabin !== "economy") out.push(i.cabin[0].toUpperCase() + i.cabin.slice(1));
  if (i.excludeDestinations.length) out.push(`Not ${i.excludeDestinations.filter((x) => !/^[A-Z]{3}$/.test(x)).join(", ") || i.excludeDestinations.join(", ")}`);
  return out;
}

export function IntentChips({ intent }: { intent: TripIntent }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips(intent).map((c) => (
        <span key={c} className="rounded-full border border-line bg-raised px-2.5 py-1 text-[13px] text-ink-2">
          {c}
        </span>
      ))}
    </div>
  );
}

const input =
  "w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-[16px] text-ink outline-none focus:border-accent/60 [color-scheme:dark]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-ink-3">{label}</span>
      {children}
    </label>
  );
}

export default function Understood({ intent, by, onRerun }: { intent: TripIntent; by: "ai" | "rules"; onRerun: (i: TripIntent) => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => toForm(intent));

  return (
    <section className="rounded-2xl border border-line bg-surface">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="min-w-0">
          <div className="text-[12px] font-medium tracking-wide text-ink-3 uppercase">What I understood</div>
          <div className="mt-0.5 truncate text-[15px] text-ink-2">{intent.summary}</div>
        </div>
        <Chevron width={18} height={18} className={`shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-line px-4 pt-3 pb-4 animate-fade">
          {!editing ? (
            <>
              <IntentChips intent={intent} />
              {intent.assumptions.length > 0 && (
                <ul className="mt-3 space-y-1 text-[13px] text-ink-3">
                  {intent.assumptions.map((a) => (
                    <li key={a}>· {a}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[12px] text-ink-3">{by === "ai" ? "Interpreted by AI" : "Interpreted by rules (AI unavailable)"}</span>
                <button
                  onClick={() => {
                    setForm(toForm(intent));
                    setEditing(true);
                  }}
                  className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-[13px] text-ink active:scale-95"
                >
                  <Pencil width={14} height={14} /> Edit
                </button>
              </div>
            </>
          ) : (
            <form
              className="grid grid-cols-2 gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                onRerun(fromForm(form, intent));
              }}
            >
              <div className="col-span-2">
                <Field label="From (airports)">
                  <input className={input} value={form.origins} onChange={(e) => setForm({ ...form, origins: e.target.value })} autoCapitalize="characters" />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="To (airports — leave empty for anywhere)">
                  <input className={input} value={form.destinations} onChange={(e) => setForm({ ...form, destinations: e.target.value })} autoCapitalize="characters" placeholder="e.g. HND, NRT" />
                </Field>
              </div>
              <Field label="Leave after">
                <input type="date" className={input} value={form.earliest} onChange={(e) => setForm({ ...form, earliest: e.target.value })} />
              </Field>
              <Field label="Leave by">
                <input type="date" className={input} value={form.latest} onChange={(e) => setForm({ ...form, latest: e.target.value })} />
              </Field>
              <Field label="Min nights">
                <input type="number" inputMode="numeric" className={input} value={form.nightsMin} onChange={(e) => setForm({ ...form, nightsMin: e.target.value })} />
              </Field>
              <Field label="Max nights">
                <input type="number" inputMode="numeric" className={input} value={form.nightsMax} onChange={(e) => setForm({ ...form, nightsMax: e.target.value })} />
              </Field>
              <Field label="Budget ($, optional)">
                <input type="number" inputMode="numeric" className={input} value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
              </Field>
              <Field label="Stops">
                <select className={input} value={form.stops} onChange={(e) => setForm({ ...form, stops: e.target.value })}>
                  <option value="any">Any</option>
                  <option value="0">Nonstop only</option>
                  <option value="1">1 stop max</option>
                  <option value="2">2 stops max</option>
                </select>
              </Field>
              <Field label="Where">
                <select className={input} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as TripIntent["scope"] })}>
                  <option value="any">Anywhere</option>
                  <option value="international">International</option>
                  <option value="domestic">Domestic</option>
                </select>
              </Field>
              <Field label="Priority">
                <select className={input} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value as TripIntent["priceSensitivity"] })}>
                  <option value="extreme">Cheapest</option>
                  <option value="high">Mostly price</option>
                  <option value="medium">Balanced</option>
                  <option value="low">Better flights</option>
                </select>
              </Field>
              <div className="col-span-2 mt-1 flex gap-2">
                <button type="button" onClick={() => setEditing(false)} className="h-11 flex-1 rounded-xl bg-raised text-[15px] text-ink-2">
                  Cancel
                </button>
                <button type="submit" className="h-11 flex-[2] rounded-xl bg-accent text-[15px] font-semibold text-white active:scale-[0.98]">
                  Re-run search
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}

function toForm(i: TripIntent) {
  return {
    origins: i.origins.join(", "),
    destinations: i.destinationMode === "specific" ? i.destinationAirports.join(", ") : "",
    earliest: i.earliestDeparture,
    latest: i.latestDeparture,
    nightsMin: String(i.tripNightsMin),
    nightsMax: String(i.tripNightsMax),
    budget: i.budgetMax ? String(i.budgetMax) : "",
    stops: i.maxStops === null ? "any" : String(i.maxStops),
    scope: i.scope,
    price: i.priceSensitivity,
  };
}

function fromForm(f: ReturnType<typeof toForm>, prev: TripIntent): TripIntent {
  const codes = (s: string) => s.split(/[\s,/]+/).map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{3}$/.test(c));
  const dests = codes(f.destinations);
  const wasSpecific = prev.destinationMode === "specific";
  const sameDest = wasSpecific && dests.join() === prev.destinationAirports.join();
  return {
    ...prev,
    origins: codes(f.origins).length ? codes(f.origins) : prev.origins,
    nearbyAirportsOk: false,
    destinationMode: dests.length ? "specific" : wasSpecific ? "anywhere" : prev.destinationMode,
    destinationAirports: dests,
    destinationLabel: dests.length ? (sameDest ? prev.destinationLabel : dests.join(" / ")) : wasSpecific ? null : prev.destinationLabel,
    earliestDeparture: f.earliest || prev.earliestDeparture,
    latestDeparture: f.latest || prev.latestDeparture,
    tripNightsMin: Number(f.nightsMin) || prev.tripNightsMin,
    tripNightsMax: Number(f.nightsMax) || prev.tripNightsMax,
    budgetMax: Number(f.budget) > 0 ? Number(f.budget) : null,
    maxStops: f.stops === "any" ? null : Number(f.stops),
    scope: f.scope,
    priceSensitivity: f.price,
    flightQualityImportance: f.price === "low" ? "high" : prev.flightQualityImportance,
    summary: "Your edited search.",
    assumptions: ["Edited by you"],
  };
}
