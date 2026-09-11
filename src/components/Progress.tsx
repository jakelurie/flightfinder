"use client";

import { useEffect, useState } from "react";
import type { TripIntent } from "@/lib/types";
import { Check, Close } from "./icons";
import { IntentChips } from "./Understood";

export interface ProgressStep {
  stage: string;
  message: string;
  at: number;
}

export default function Progress(props: {
  text: string;
  steps: ProgressStep[];
  intent: TripIntent | null;
  error: string | null;
  demo: boolean;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const { text, steps, intent, error, demo, onCancel, onRetry } = props;
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(started);

  useEffect(() => {
    if (error) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [error]);

  const elapsed = Math.max(0, Math.floor((now - started) / 1000));

  return (
    <main className="glow min-h-dvh">
      <div className="mx-auto max-w-md px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-safe">
        <header className="flex items-center justify-between py-2">
          <button onClick={onCancel} className="-ml-2 flex items-center gap-1 rounded-full px-2 py-1.5 text-[15px] text-ink-2 active:scale-95">
            <Close width={18} height={18} /> Cancel
          </button>
          <span className="text-[13px] tabular-nums text-ink-3">{elapsed}s</span>
        </header>

        <p className="mt-8 text-[22px] leading-snug font-medium tracking-tight text-ink animate-rise">&ldquo;{text}&rdquo;</p>

        {intent && (
          <div className="mt-5 animate-rise">
            <div className="mb-2 text-[12px] font-medium tracking-wide text-ink-3 uppercase">What I understood</div>
            <p className="mb-3 text-[15px] text-ink-2">{intent.summary}</p>
            <IntentChips intent={intent} />
          </div>
        )}

        <ol className="mt-8 space-y-0">
          {steps.map((s, i) => {
            const current = i === steps.length - 1 && !error;
            return (
              <li key={`${s.at}-${i}`} className="relative flex gap-3 pb-5 animate-rise">
                {i < steps.length - 1 && <span className="absolute top-6 left-[11px] h-[calc(100%-18px)] w-px bg-line" />}
                <span
                  className={`relative mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${current ? "bg-accent-soft" : "bg-raised"}`}
                >
                  {current ? (
                    <span className="size-2.5 rounded-full bg-accent animate-breathe" />
                  ) : (
                    <Check width={13} height={13} className="text-save" strokeWidth={3} />
                  )}
                </span>
                <span className={`text-[16px] leading-snug ${current ? "text-ink" : "text-ink-3"}`}>{s.message}</span>
              </li>
            );
          })}
          {!steps.length && !error && (
            <li className="flex gap-3">
              <span className="grid size-6 place-items-center rounded-full bg-accent-soft">
                <span className="size-2.5 rounded-full bg-accent animate-breathe" />
              </span>
              <span className="text-[16px] text-ink">Starting…</span>
            </li>
          )}
        </ol>

        {!error && <div className="shimmer-line mt-2 h-px w-full" />}

        {error && (
          <div className="mt-4 rounded-2xl border border-warn/25 bg-warn/10 p-4 animate-rise">
            <div className="text-[15px] font-medium text-warn">Couldn&apos;t finish that search</div>
            <p className="mt-1 text-[15px] text-ink-2">{error}</p>
            <button onClick={onRetry} className="mt-3 rounded-full bg-raised px-4 py-2 text-[14px] text-ink active:scale-95">
              Go back
            </button>
          </div>
        )}

        {demo && !error && (
          <p className="mt-8 text-center text-[12px] text-ink-3">Using demo fares — results are illustrative, not real prices.</p>
        )}
      </div>
    </main>
  );
}
