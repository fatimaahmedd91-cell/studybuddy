"use client";

// The landing page for visitors who aren't logged in.
import { useState } from "react";
import { ErrorBox } from "@/components/States";
import { Button, ButtonLink, DarkPanel, OrangeCard } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const FEATURES = [
  ["🤝", "Find friends, not dates", "Match on shared interests, friendship goals, your university, and when you're both free."],
  ["✨", "See why you'd click", "Gemini writes a conversation starter from what you actually share. Nothing is made up."],
  ["👥", "Groups and events", "Join study groups and clubs, RSVP to events, and meet people in person."],
];

export default function Landing() {
  const { startSession } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function tryDemo() {
    setBusy(true);
    setError(null);
    try {
      const session = await api.startDemo();
      startSession(session.access_token, session.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the demo.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-bark text-xl font-bold text-paper">ff</span>
        <span className="text-3xl font-extrabold tracking-wide">FriendFinder</span>
      </div>

      <section className="mt-10 grid items-center gap-8 md:grid-cols-[1.2fr_1fr]">
        <div>
          <h1 className="text-4xl font-extrabold leading-tight sm:text-6xl">Find your people on campus.</h1>
          <p className="mt-4 max-w-xl text-lg">
            FriendFinder helps students meet platonic friends and study buddies who share their interests, goals,
            and free time, then find groups and events to do things together.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/signup" className="px-6 text-lg">Sign up</ButtonLink>
            <ButtonLink href="/login" variant="outline" className="px-6 text-lg">Log in</ButtonLink>
          </div>
        </div>

        <OrangeCard>
          <div className="space-y-3 p-6">
            <h2 className="text-2xl font-bold">Just looking?</h2>
            <p>
              Try FriendFinder with a <b>demo account</b>: a ready-made profile, fictional students, groups and events.
              No email or personal details needed.
            </p>
            <Button onClick={tryDemo} disabled={busy} className="w-full text-lg">
              {busy ? "Setting up your demo…" : "Try the demo"}
            </Button>
            <p className="text-xs opacity-75">Demo accounts are temporary and clearly marked. Everyone in the demo is made up.</p>
            {error && <ErrorBox message={error} />}
          </div>
        </OrangeCard>
      </section>

      <section className="mt-12 grid gap-4 sm:grid-cols-3" aria-label="What you can do">
        {FEATURES.map(([icon, title, text]) => (
          <DarkPanel key={title}>
            <p className="text-3xl" aria-hidden="true">{icon}</p>
            <h2 className="mt-2 text-xl font-bold">{title}</h2>
            <p className="mt-1 text-sm opacity-90">{text}</p>
          </DarkPanel>
        ))}
      </section>
    </main>
  );
}
