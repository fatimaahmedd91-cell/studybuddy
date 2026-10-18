"use client";

// Who may use your PRIVATE schedule when planning. Off by default for everyone.
// The server enforces this (backend/app/planning.py): without permission, plans only see your public free times,
// and with it, people still only see the resulting free times, never your commitments.
import { useState } from "react";
import Dialog from "@/components/Dialog";
import { ErrorBox, Loading, Notice } from "@/components/States";
import { Button } from "@/components/ui";
import { planning, type PlanningConsents as Consents } from "@/lib/planning";
import { useApi } from "@/lib/useApi";

type Pending = { scope: "friends" } | { scope: "group"; id: number; name: string };

export default function PlanningConsents() {
  const { data, error, loading, reload, setData } = useApi(() => planning.consents(), []);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function change(run: () => Promise<Consents>, text: string) {
    setBusy(true);
    setMessage(null);
    try {
      setData(await run());
      setMessage({ kind: "success", text });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "That didn't save." });
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  return (
    <section aria-labelledby="consents-title" className="space-y-3 rounded-frame bg-cream p-5">
      <h2 id="consents-title" className="text-xl font-bold">Who can plan around your private schedule</h2>
      <p className="text-sm">
        Off unless you turn it on. When it&apos;s on, people planning with you see shared free times, never your
        commitments, their names or places.
      </p>
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <ul className="space-y-2">
          <li className="flex flex-wrap items-center justify-between gap-2 rounded-inner bg-sky px-3 py-2">
            <span>
              <b>Plans friends make with me</b>
              <span className="block text-xs">{data.friends ? "Allowed" : "Not allowed: only your public free times are used"}</span>
            </span>
            {data.friends ? (
              <Button variant="outline" disabled={busy}
                onClick={() => change(() => planning.revoke("friends"), "Friends' plans no longer use your private schedule.")}>
                Stop allowing
              </Button>
            ) : (
              <Button variant="dark" disabled={busy} onClick={() => setPending({ scope: "friends" })}>Allow…</Button>
            )}
          </li>
          {data.groups.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-inner bg-sky px-3 py-2">
              <span>
                <b>{g.name}</b>
                <span className="block text-xs">{g.allowed ? "Allowed for this group" : "Not allowed"}</span>
              </span>
              {g.allowed ? (
                <Button variant="outline" disabled={busy}
                  onClick={() => change(() => planning.revoke("group", g.id), `${g.name} no longer uses your private schedule.`)}>
                  Stop allowing
                </Button>
              ) : (
                <Button variant="dark" disabled={busy} onClick={() => setPending({ scope: "group", id: g.id, name: g.name })}>Allow…</Button>
              )}
            </li>
          ))}
          {data.groups.length === 0 && <li className="text-sm">You&apos;re not in any groups yet.</li>}
        </ul>
      )}
      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      {pending && (
        <Dialog title={pending.scope === "group" ? `Allow ${pending.name}?` : "Allow friends' plans?"} onClose={() => setPending(null)}>
          <div className="space-y-4">
            <p>
              {pending.scope === "group"
                ? "Allow this group to use your private commitments to calculate shared free times? Members will see proposed free-time results, not your private event titles or locations."
                : "Allow plans your friends make with you to use your private commitments to calculate shared free times? They will see proposed free-time results, not your private event titles or locations."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() =>
                pending.scope === "group"
                  ? change(() => planning.allow("group", pending.id), `Allowed for ${pending.name}.`)
                  : change(() => planning.allow("friends"), "Allowed for plans with friends.")}>
                {pending.scope === "group" ? "Allow for this group" : "Allow for friends"}
              </Button>
              <Button variant="outline" onClick={() => setPending(null)}>Not now</Button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
