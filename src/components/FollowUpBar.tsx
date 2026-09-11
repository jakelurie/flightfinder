"use client";

import { useState } from "react";
import { ArrowUp } from "./icons";

export default function FollowUpBar({ suggestions, onSubmit }: { suggestions: string[]; onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  const send = (t: string) => {
    if (!t.trim()) return;
    onSubmit(t.trim());
    setText("");
  };
  return (
    <div className="fixed inset-x-0 bottom-0 z-40">
      <div className="pointer-events-none h-8 bg-gradient-to-t from-bg to-transparent" />
      <div className="border-t border-line bg-bg/85 backdrop-blur-xl pb-safe">
        <div className="mx-auto max-w-md">
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-2.5">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="shrink-0 rounded-full border border-line bg-raised px-3 py-1.5 text-[13px] text-ink-2 active:scale-95 transition"
              >
                {s}
              </button>
            ))}
          </div>
          <form
            className="flex items-center gap-2 px-4 pt-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              enterKeyHint="send"
              placeholder="Change anything — “only nonstop”, “what about Europe?”"
              className="h-12 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 text-[16px] text-ink placeholder:text-ink-3 outline-none focus:border-accent/60"
            />
            <button
              type="submit"
              disabled={!text.trim()}
              aria-label="Send"
              className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-white transition active:scale-95 disabled:opacity-35"
            >
              <ArrowUp width={20} height={20} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
