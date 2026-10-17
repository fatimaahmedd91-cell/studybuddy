"use client";

// Settings: your account, which demo student you are, and whether the backend is working.
import Link from "next/link";
import { useEffect, useState } from "react";
import { DarkButton, OrangeCard, PageTitle } from "@/components/ui";
import { type Health, fetchHealth } from "@/lib/api";
import { students } from "@/lib/data";
import { useStore } from "@/lib/store";

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg bg-paper px-3 py-2">
      <span className="font-medium">{label}</span>
      <span className="text-right text-sm">
        <span aria-hidden="true">{ok ? "✅" : "⚠️"}</span> {ok ? "Working" : "Problem"} · {detail}
      </span>
    </li>
  );
}

function BackendStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);

  function check() {
    setHealth(null);
    setFailed(false);
    fetchHealth().then(setHealth).catch(() => setFailed(true));
  }

  useEffect(check, []);

  return (
    <div>
      <ul className="space-y-2">
        {failed && <StatusRow label="Backend" ok={false} detail="not reachable" />}
        {!failed && !health && <li className="text-sm">Checking…</li>}
        {health && (
          <>
            <StatusRow label="Backend" ok detail="running" />
            <StatusRow label="Database" ok={health.database.ok} detail={health.database.detail} />
            <StatusRow label="Gemini AI" ok={health.gemini.ok} detail={health.gemini.detail} />
          </>
        )}
      </ul>
      <button onClick={check} className="mt-3 text-sm font-semibold underline">
        Check again
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { me, setMeId, account, logout, resetDemo } = useStore();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <PageTitle>Settings</PageTitle>

      <OrangeCard>
        <section className="space-y-3 p-6">
          <h2 className="text-2xl font-semibold">Account</h2>
          {account ? (
            <>
              <p>
                Logged in as <b>{account.name}</b> ({account.email})
              </p>
              <DarkButton onClick={logout}>Log out</DarkButton>
            </>
          ) : (
            <>
              <p>You are not logged in.</p>
              <div className="flex gap-3">
                <Link href="/login" className="rounded-xl bg-bark px-5 py-2.5 font-semibold text-paper">
                  Log in
                </Link>
                <Link href="/signup" className="rounded-xl border-2 border-bark px-5 py-2 font-semibold">
                  Sign up
                </Link>
              </div>
            </>
          )}
        </section>
      </OrangeCard>

      <OrangeCard>
        <section className="space-y-3 p-6">
          <h2 className="text-2xl font-semibold">Demo profile</h2>
          <p className="text-sm">
            Courses, interests, free time, posts, groups, and chats are demo data for now. Pick which student you are:
          </p>
          <label className="block text-sm font-medium">
            Demo as
            <select
              value={me.id}
              onChange={(e) => setMeId(Number(e.target.value))}
              className="ml-2 rounded-lg border-2 border-bark/30 bg-paper px-2 py-1.5"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.avatar} {s.name}
                </option>
              ))}
            </select>
          </label>
          {confirmReset ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Clear your demo posts, chats, groups, and events?</span>
              <DarkButton
                onClick={() => {
                  resetDemo();
                  setConfirmReset(false);
                }}
              >
                Yes, reset
              </DarkButton>
              <button onClick={() => setConfirmReset(false)} className="px-3 py-2 text-sm font-medium">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmReset(true)} className="text-sm font-semibold underline">
              Reset demo data
            </button>
          )}
        </section>
      </OrangeCard>

      <OrangeCard>
        <section className="space-y-3 p-6">
          <h2 className="text-2xl font-semibold">System status</h2>
          <BackendStatus />
        </section>
      </OrangeCard>

      <OrangeCard>
        <section className="space-y-2 p-6 text-sm">
          <h2 className="text-2xl font-semibold">Privacy &amp; AI</h2>
          <p>
            <b>Matching is plain math</b>: shared interests (up to 40 points), courses (35), and free time (25). No AI ranks
            people.
          </p>
          <p>
            <b>Only the &ldquo;Why you might get along&rdquo; note uses AI</b> (Google Gemini). It sends only what two people
            share (interests, courses, free times), never names or contact details.
          </p>
          <p>Passwords are stored as Argon2 hashes, never as plain text.</p>
        </section>
      </OrangeCard>
    </div>
  );
}
