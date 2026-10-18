"use client";

// The landing page for visitors who aren't logged in.
import { useState } from "react";
import { MeetkatMark } from "@/components/Brand";
import LegalLinks from "@/components/LegalLinks";
import { ErrorBox } from "@/components/States";
import { Button, ButtonLink, DarkPanel, FrameCard } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { BRAND } from "@/lib/brand";

const FEATURES = [
  ["Friends, not dates", "Match on shared interests, friendship goals, your campus, and when you're both free."],
  ["Plans that fit", "Find times that really work for everyone, without anyone sharing their private schedule."],
  ["Memories together", "Share moments with your mob, with you in control of who sees them."],
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
        <MeetkatMark className="h-16 w-16" />
        <span className="text-3xl font-extrabold tracking-wide">{BRAND.name}</span>
      </div>

      <section className="mt-10 grid items-center gap-8 md:grid-cols-[1.2fr_1fr]">
        <div>
          <h1 className="text-4xl font-extrabold leading-tight sm:text-6xl">{BRAND.tagline}</h1>
          <p className="mt-4 max-w-xl text-2xl font-semibold">{BRAND.slogan}</p>
          <p className="mt-2 max-w-xl text-lg">Meerkats are social animals! For adults 18+.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/signup" className="px-6 text-lg">Sign up</ButtonLink>
            <ButtonLink href="/login" variant="outline" className="px-6 text-lg">Log in</ButtonLink>
          </div>
        </div>

        <FrameCard>
          <div className="space-y-3 p-6">
            <h2 className="text-2xl font-bold">Just looking?</h2>
            <p>
              Try {BRAND.name} with a <b>demo account</b>: a ready-made profile, fictional people, groups and events.
              No email or personal details needed.
            </p>
            <Button onClick={tryDemo} disabled={busy} className="w-full text-lg">
              {busy ? "Setting up your demo…" : "Try the demo"}
            </Button>
            <p className="text-xs opacity-75">
              Demo accounts are temporary and clearly marked. Everyone in the demo is made up. You&apos;ll be asked to
              accept the Terms first.
            </p>
            {error && <ErrorBox message={error} />}
          </div>
        </FrameCard>
      </section>

      <section className="mt-12 grid gap-4 sm:grid-cols-3" aria-label="What you can do">
        {FEATURES.map(([title, text]) => (
          <DarkPanel key={title}>
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="mt-1 text-sm opacity-90">{text}</p>
          </DarkPanel>
        ))}
      </section>

      <footer className="mt-12 border-t-2 border-sky-strong pt-4">
        <LegalLinks />
      </footer>
    </main>
  );
}
