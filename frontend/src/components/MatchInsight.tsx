"use client";

// The "Why you might connect" card: Gemini's note (or the template note), a conversation
// starter you can copy, an activity idea, and exactly what was sent to Gemini.
import { useState } from "react";
import { api } from "@/lib/api";
import type { Insight } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { ErrorBox, Loading } from "./States";
import { Button } from "./ui";

const FALLBACK_REASONS: Record<string, string> = {
  not_configured: "Gemini isn't set up on this server",
  quota: "Gemini's usage limit was reached",
  timeout: "Gemini took too long to answer",
  invalid_response: "Gemini's answer couldn't be used",
  rate_limited: "you've asked for a lot of notes recently",
  error: "Gemini had a problem",
};

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <Button
      variant="outline"
      className="min-h-9 px-3 text-sm"
      onClick={() => {
        // The clipboard only works on https:// addresses (and localhost).
        if (!navigator.clipboard) return setState("failed");
        navigator.clipboard.writeText(text).then(
          () => setState("copied"),
          () => setState("failed"),
        );
      }}
    >
      {state === "copied" ? "Copied ✓" : state === "failed" ? "Copy failed: select the text" : "Copy"}
    </Button>
  );
}

function FactsSent({ insight }: { insight: Insight }) {
  const f = insight.facts_sent;
  const items = [
    ["Shared interests", f.shared_interests.join(", ") || "none"],
    ["Shared friendship goals", f.shared_friendship_goals.join(", ") || "none"],
    ["Same university", f.same_university || "no"],
    ["Times you're both free", f.both_free.join(", ") || "none"],
  ];
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer font-semibold">
        {insight.source === "gemini" ? "What was sent to Gemini?" : "What would be sent to Gemini?"}
      </summary>
      <p className="mt-1">Only what you both share. Never names, emails, ages, bios, or photos.</p>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {items.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="font-medium">{label}:</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export default function MatchInsight({ personId }: { personId: number }) {
  const { data, error, loading, reload } = useApi(() => api.insight(personId), [personId]);

  return (
    <section aria-labelledby="insight-title" className="rounded-2xl border-2 border-bark bg-paper p-5">
      <h2 id="insight-title" className="text-xl font-bold">Why you might connect</h2>
      {loading && <Loading label="Asking Gemini… (a few seconds the first time)" />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <div className="mt-2 space-y-3" aria-live="polite">
          <p className="inline-block rounded-full bg-bark px-3 py-1 text-xs font-semibold text-paper">
            {data.source === "gemini"
              ? "✨ Written by Gemini"
              : `Suggested by FriendFinder (not AI): ${FALLBACK_REASONS[data.fallback_reason ?? "error"] ?? "Gemini unavailable"}`}
          </p>
          <p className="text-lg">{data.explanation}</p>
          <div>
            <p className="text-sm font-semibold">Conversation starter</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="rounded-xl bg-card px-3 py-2">{data.conversation_starter}</p>
              <CopyButton text={data.conversation_starter} />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold">Activity idea</p>
            <p>{data.activity}</p>
          </div>
          <FactsSent insight={data} />
        </div>
      )}
    </section>
  );
}
