"use client";

// Settings: your account, privacy information, and whether the server is healthy.
import { useState } from "react";
import Dialog from "@/components/Dialog";
import { ErrorBox, Loading } from "@/components/States";
import { Button, DemoBadge, FrameCard, PageHeading, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth, useMe } from "@/lib/auth";
import { useApi } from "@/lib/useApi";

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-cream px-3 py-2">
      <span className="font-semibold">{label}</span>
      <span className="text-sm"><span aria-hidden="true">{ok ? "✅" : "⚠️"}</span> {ok ? "Working" : "Not working"}: {detail}</span>
    </li>
  );
}

function DeleteAccount() {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount();
      logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete your account.");
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>Delete my account</Button>
      {open && (
        <Dialog title="Delete your account?" onClose={() => setOpen(false)}>
          <p>This permanently deletes your profile, photo, friendships, messages, posts, and RSVPs. It can&apos;t be undone.</p>
          <label className="mt-4 block text-sm font-semibold" htmlFor="confirm-delete">Type DELETE to confirm</label>
          <input id="confirm-delete" value={typed} onChange={(e) => setTyped(e.target.value)} className={`${inputClass} mt-1`} />
          {error && <div className="mt-3"><ErrorBox message={error} /></div>}
          <div className="mt-5 flex gap-2">
            <Button variant="danger" disabled={typed !== "DELETE" || busy} onClick={confirm}>{busy ? "Deleting…" : "Delete forever"}</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}

export default function SettingsPage() {
  const me = useMe();
  const { logout } = useAuth();
  const health = useApi(() => api.health(), []);

  return (
    <div>
      <PageHeading title="Settings" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <FrameCard>
          <section className="space-y-3 p-6">
            <h2 className="text-2xl font-bold">Account</h2>
            <p className="flex flex-wrap items-center gap-2">Logged in as <b>{me.name}</b> {me.is_demo && <DemoBadge />}</p>
            {me.is_demo ? (
              <p className="text-sm">This is a temporary demo account with fictional data. It can be removed at any time.</p>
            ) : (
              <p className="text-sm">Email: {me.email} (only you can see this)</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={logout}>Log out</Button>
              <DeleteAccount />
            </div>
          </section>
        </FrameCard>

        <FrameCard>
          <section className="space-y-2 p-6 text-sm">
            <h2 className="text-2xl font-bold">Privacy &amp; AI</h2>
            <p><b>Match scores are plain math:</b> shared interests (up to 40 points), friendship goals (20), same university (15), and shared free time (25). No AI ranks people.</p>
            <p><b>Gemini only writes the &ldquo;Why you might connect&rdquo; note.</b> It receives only what two people share: interests, friendship goals, university (if the same), and free times you have in common. Never names, emails, ages, bios, or photos. Each profile page shows exactly what was sent.</p>
            <p><b>Others never see</b> your email or your whole timetable, only the times you&apos;re both free.</p>
            <p><b>Photos</b> are resized and stripped of location data before they&apos;re saved.</p>
            <p><b>Passwords</b> are stored as Argon2 hashes, never as plain text.</p>
          </section>
        </FrameCard>

        <FrameCard>
          <section className="space-y-3 p-6">
            <h2 className="text-2xl font-bold">System status</h2>
            {health.loading && <Loading />}
            {health.error && <ErrorBox message="The server can't be reached." onRetry={health.reload} />}
            {health.data && (
              <ul className="space-y-2">
                <StatusRow label="Backend" ok detail="running" />
                <StatusRow label="Database" ok={health.data.database.ok}
                  detail={`${health.data.database.detail}${health.data.database.timescaledb ? " (TimescaleDB)" : ""}`} />
                <StatusRow label="Gemini AI" ok={health.data.gemini.ok}
                  detail={health.data.gemini.ok ? health.data.gemini.detail : `${health.data.gemini.detail}. Template notes are used instead.`} />
              </ul>
            )}
            <Button variant="outline" onClick={health.reload}>Check again</Button>
          </section>
        </FrameCard>

        <FrameCard>
          <section className="space-y-2 p-6 text-sm">
            <h2 className="text-2xl font-bold">Safety: what&apos;s not built yet</h2>
            <p>FriendFinder is a hackathon project. Before real launch it still needs:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Blocking and reporting people</li>
              <li>Email verification and password reset</li>
              <li>Moderation of messages and group posts</li>
            </ul>
            <p>Until then: only accept requests from people you recognise, and meet new friends in public places.</p>
          </section>
        </FrameCard>
      </div>
    </div>
  );
}
