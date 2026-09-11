"use client";

import { useRef } from "react";
import type { AppStatus } from "@/lib/client";
import type { TripResult } from "@/lib/types";
import { ArrowUp, Sparkle } from "./icons";

const CHIPS: { label: string; text: string }[] = [
  {label: "One way", text: "Find a cheap one-way flight to Tokyo in the next month."},
  {label: "Make it an adventure", text: "Suggest a multi-city trip to Japan with an interesting stopover for a few days in another city, then fly home. About 10 nights next month. Compare the total airfare."},
  { label: "Anywhere cheap soon", text: "Find me somewhere cheap and fun to fly to in the next few weeks." },
  { label: "Tropical next month", text: "I want to go somewhere tropical for about a week sometime next month." },
  { label: "Europe for a week", text: "Europe for about a week sometime in the next two months. Good value, not horrible flights." },
  { label: "Tokyo sometime soon", text: "I want to go to Tokyo sometime in the next four weeks. Figure out the best dates." },
  { label: "Surprise me", text: "Surprise me: somewhere awesome and surprisingly cheap that I can get far away to in the next month." },
];

export default function Home(props: {
  draft: string;
  setDraft: (s: string) => void;
  status: AppStatus | null;
  recent: string[];
  onSubmit: (text: string) => void;
  lastResult: TripResult | null;
  onShowLast: () => void;
}) {
  const { draft, setDraft, status, recent, onSubmit, lastResult, onShowLast } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  const submit = () => {
    const text = ref.current?.value.trim() ?? draft.trim();
    if (text) onSubmit(text);
    else ref.current?.focus();
  };

  return (
    <main className="glow min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-safe">
        <header className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent">
              <Sparkle width={16} height={16} />
            </span>
            flightfinder
          </div>
          {status && <ModePill status={status} />}
        </header>

        <section className="mt-[12vh] animate-rise">
          <h1 className="text-[34px] leading-[1.08] font-semibold tracking-tight">Where do you want to go?</h1>
          <p className="mt-2 text-[17px] text-ink-2">Be as specific or vague as you want.</p>
        </section>

        <form
          action="/" method="get"
          className="mt-7 animate-rise [animation-delay:60ms]"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="rounded-[26px] border border-line bg-surface p-1.5 shadow-[0_20px_60px_-20px_rgb(0_0_0/0.6)] focus-within:border-accent/50 transition-colors">
            <textarea
              ref={ref}
              name="trip"
              required
              aria-label="Describe your trip"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={4}
              enterKeyHint="go"
              placeholder="Somewhere warm with great food for a week next month, under $900…"
              className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[17px] leading-relaxed text-ink placeholder:text-ink-3 outline-none"
            />
          </div>

          <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5">
            {CHIPS.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => {
                  setDraft(c.text);
                  ref.current?.focus();
                }}
                className="shrink-0 rounded-full border border-line bg-raised px-3.5 py-2 text-[14px] text-ink-2 active:scale-95 transition hover:text-ink"
              >
                {c.label}
              </button>
            ))}
          </div>

          <button
            type="submit"
            className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[17px] font-semibold text-white shadow-[0_10px_30px_-10px_rgb(77_141_246/0.7)] transition active:scale-[0.98] disabled:opacity-35 disabled:shadow-none"
          >
            Analyze Trips
            <ArrowUp width={18} height={18} className="rotate-90" />
          </button>
        </form>

        <div className="mt-8 flex-1 animate-fade [animation-delay:150ms]">
          {lastResult && (
            <button onClick={onShowLast} className="mb-5 w-full rounded-2xl border border-line bg-surface px-4 py-3 text-left active:scale-[0.99] transition">
              <div className="text-[12px] font-medium tracking-wide text-ink-3 uppercase">Last analysis</div>
              <div className="mt-0.5 truncate text-[15px] text-ink">{lastResult.analysis.headline}</div>
            </button>
          )}
          {recent.length > 0 && (
            <div>
              <div className="mb-2 text-[12px] font-medium tracking-wide text-ink-3 uppercase">Recent</div>
              <ul className="space-y-1">
                {recent.slice(0, 4).map((r) => (
                  <li key={r}>
                    <button onClick={() => setDraft(r)} className="w-full truncate py-1.5 text-left text-[15px] text-ink-2 hover:text-ink">
                      {r}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {status && (
          <footer className="py-4 text-center text-[12px] text-ink-3">
            {status.demo ? "Simulated demo fares" : `Live fares from ${status.provider}`}
            {" · "}
            {status.ai ? status.model : "Rule-based analysis (Claude CLI not found)"}
          </footer>
        )}
      </div>
    </main>
  );
}

export function ModePill({ status }: { status: { demo: boolean } }) {
  return status.demo ? (
    <span className="rounded-full border border-warn/30 bg-warn/10 px-2.5 py-1 text-[12px] font-medium text-warn">Demo data</span>
  ) : (
    <span className="flex items-center gap-1.5 rounded-full border border-save/25 bg-save/10 px-2.5 py-1 text-[12px] font-medium text-save">
      <span className="size-1.5 rounded-full bg-save" />
      Live fares
    </span>
  );
}
