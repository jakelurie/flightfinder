"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { streamTrip, pendingTrip, forgetPendingTrip, type AppStatus } from "@/lib/client";
import type { TripIntent, TripRequestBody, TripResult } from "@/lib/types";
import Home from "./Home";
import Progress, { type ProgressStep } from "./Progress";
import Results from "./Results";
import JourneyResults from "./JourneyResults";

type Phase = "home" | "searching" | "results";

const STORAGE_KEY = "flightfinder:last";
const RECENT_KEY = "flightfinder:recent";

export default function TripApp({ initialQuery = "" }: { initialQuery?: string }) {
  const [phase, setPhase] = useState<Phase>("home");
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [draft, setDraft] = useState(initialQuery);
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [liveIntent, setLiveIntent] = useState<TripIntent | null>(null);
  const [pendingText, setPendingText] = useState("");
  const [result, setResult] = useState<TripResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/status")
      .then((r) => r.json())
      .then((s: AppStatus) => !cancelled && setStatus(s))
      .catch(() => {});
    Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && !initialQuery && !pendingTrip()) {
          setResult(JSON.parse(saved) as TripResult);
          setPhase("results");
        }
        setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[]);
      } catch {
        /* ignore corrupt storage */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [initialQuery]);

  const run = useCallback(
    async (body: TripRequestBody & { referencePrice?: number }, displayText: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setError(null);
      setSteps([]);
      setLiveIntent(null);
      setPendingText(displayText);
      setPhase("searching");
      window.scrollTo({ top: 0 });

      let finished = false;
      try {
        await streamTrip(
          body,
          (event) => {
            if (controller.signal.aborted) return;
            if (event.type === "progress") {
              setSteps((prev) => [...prev, { stage: event.stage, message: event.message, at: Date.now() }]);
            } else if (event.type === "intent") {
              setLiveIntent(event.intent);
            } else if (event.type === "result") {
              finished = true;
              setResult(event.result);
              setPhase("results");
              window.scrollTo({ top: 0 });
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(event.result));
              } catch {
                /* storage full */
              }
            } else if (event.type === "error") {
              finished = true;
              setError(event.message);
            }
          },
          controller.signal,
        );
        if (!finished) setError("The search ended unexpectedly. Try again.");
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    },
    [],
  );

  const recovered = useRef(false);
  useEffect(() => {
    const pending = pendingTrip();
    if ((!initialQuery && !pending) || recovered.current) return;
    recovered.current = true;
    window.history.replaceState(null, "", "/");
    void run(initialQuery ? { query: initialQuery } : pending!.body, initialQuery || pending!.body.followUp || pending!.body.query);
  }, [initialQuery, run]);

  const submitNew = useCallback(
    (text: string) => {
      const q = text.trim();
      if (!q) return;
      setRecent((prev) => {
        const next = [q, ...prev.filter((p) => p !== q)].slice(0, 5);
        try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* Search still works without storage. */ }
        return next;
      });
      run({ query: q }, q);
    },
    [run],
  );

  const submitFollowUp = useCallback(
    (text: string) => {
      if (!result || !text.trim()) return;
      const recommended = result.itineraries.find((i) => i.id === result.analysis.recommendedId);
      run(
        {
          query: result.query,
          followUps: result.followUps,
          followUp: text.trim(),
          previousIntent: result.intent,
          referencePrice: result.journeys?.[0]?.total ?? recommended?.price,
        },
        text.trim(),
      );
    },
    [result, run],
  );

  const rerunWithIntent = useCallback(
    (intent: TripIntent) => {
      if (!result) return;
      run({ query: result.query, followUps: result.followUps, intentOverride: intent }, "Re-running with your edits");
    },
    [result, run],
  );

  const goHome = useCallback(() => {
    abortRef.current?.abort();
    forgetPendingTrip();
    setPhase("home");
    setError(null);
    setDraft("");
    window.scrollTo({ top: 0 });
  }, []);

  const cancelSearch = useCallback(() => {
    abortRef.current?.abort();
    forgetPendingTrip();
    setError(null);
    setPhase(result ? "results" : "home");
  }, [result]);

  if (phase === "searching") {
    return (
      <Progress
        text={pendingText}
        steps={steps}
        intent={liveIntent}
        error={error}
        demo={status?.demo ?? false}
        onCancel={cancelSearch}
        onRetry={() => (result ? setPhase("results") : goHome())}
      />
    );
  }

  if (phase === "results" && result) {
    if (result.journeys?.length) return <JourneyResults result={result} onNewSearch={goHome} onFollowUp={submitFollowUp} />;
    return <Results result={result} onNewSearch={goHome} onFollowUp={submitFollowUp} onRerun={rerunWithIntent} />;
  }

  return (
    <Home
      draft={draft}
      setDraft={setDraft}
      status={status}
      recent={recent}
      onSubmit={submitNew}
      lastResult={result}
      onShowLast={() => setPhase("results")}
    />
  );
}
