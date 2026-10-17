"use client";

// "Why you might get along". Asks Gemini through our backend first, and falls back to a
// fixed template if the AI is not available. The badge always says which one you see.
import { useEffect, useState } from "react";
import { fetchInsight } from "@/lib/api";
import type { Match } from "@/lib/matching";

function joinList(items: string[]) {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function templateInsight(match: Match) {
  const parts: string[] = [];
  if (match.sharedCourses.length) parts.push(`you are both taking ${joinList(match.sharedCourses)}`);
  if (match.sharedInterests.length)
    parts.push(`you both enjoy ${joinList(match.sharedInterests.map((i) => i.toLowerCase()))}`);
  if (match.sharedSlots.length) {
    const first = match.sharedSlots[0];
    parts.push(`you are both free on ${first.day} ${first.slot}s`);
  }
  return parts.length
    ? `You might get along because ${joinList(parts)}.`
    : "You do not share much on paper, but a new perspective can make a great study partner.";
}

type State = { status: "loading" } | { status: "ai" | "template"; text: string };

export default function InsightPanel({ match }: { match: Match }) {
  const [state, setState] = useState<State>({ status: "loading" });

  // Only re-ask when the shared facts change, not on every render.
  const factsKey = JSON.stringify([match.sharedInterests, match.sharedCourses, match.sharedSlots]);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchInsight(match)
      .then((text) => !cancelled && setState({ status: "ai", text }))
      .catch(() => !cancelled && setState({ status: "template", text: templateInsight(match) }));
    return () => {
      cancelled = true;
    };
  }, [factsKey]); // factsKey describes match, so match is not listed separately.

  const badge =
    state.status === "loading" ? "Asking Gemini…" : state.status === "ai" ? "AI insight · Gemini" : "Template insight";

  return (
    <div className="rounded-2xl border-2 border-bark bg-paper p-4">
      <h3 className="flex flex-wrap items-center gap-2 font-semibold">
        ✨ Why you might get along
        <span className="rounded-full bg-bark px-2.5 py-0.5 text-[11px] font-semibold text-paper">{badge}</span>
      </h3>
      <p className={`mt-2 text-sm leading-relaxed ${state.status === "loading" ? "opacity-60" : ""}`}>
        {state.status === "loading" ? "Working out what you two have in common…" : state.text}
      </p>
    </div>
  );
}
