"use client";

// "Report" and "Block" buttons, used on profiles, messages, memories, groups and events.
// Both are checked and enforced by the server (backend/app/safety.py); these are just the buttons.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ReportTarget } from "@/lib/types";
import Dialog from "./Dialog";
import { FlagIcon } from "./Icons";
import { Notice } from "./States";
import { Button, Field, inputClass } from "./ui";

let reasonsCache: Promise<{ value: string; label: string }[]> | null = null;

export function ReportButton({
  targetType,
  targetId,
  label = "Report",
  className = "",
}: {
  targetType: ReportTarget;
  targetId: number;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className={`min-h-9 px-3 text-sm ${className}`}>
        <FlagIcon className="h-4 w-4" /> {label}
      </Button>
      {open && <ReportDialog targetType={targetType} targetId={targetId} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ReportDialog({ targetType, targetId, onClose }: { targetType: ReportTarget; targetId: number; onClose: () => void }) {
  const [reasons, setReasons] = useState<{ value: string; label: string }[]>([]);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    reasonsCache ??= api.reportReasons();
    reasonsCache.then(setReasons).catch(() => (reasonsCache = null));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) return setError("Pick a reason.");
    setBusy(true);
    setError(null);
    try {
      await api.report({ target_type: targetType, target_id: targetId, reason, details });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your report wasn't sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Report" onClose={onClose}>
      {done ? (
        <div className="space-y-3">
          <Notice kind="success">Report sent. Moderators will review it.</Notice>
          <p className="text-sm">
            The person you reported isn&apos;t told who reported them. Moderation isn&apos;t around the clock, so this may
            take a while. If someone is in immediate danger, contact local emergency services.
          </p>
          <Button onClick={onClose}>Close</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <fieldset>
            <legend className="text-sm font-semibold">Why are you reporting this?</legend>
            <div className="mt-1 space-y-1">
              {reasons.map((r) => (
                <label key={r.value} className="flex min-h-10 items-center gap-2">
                  <input type="radio" name="reason" value={r.value} checked={reason === r.value}
                    onChange={() => setReason(r.value)} className="h-5 w-5 accent-bark" />
                  {r.label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Anything else moderators should know? (optional)" htmlFor="report-details">
            <textarea id="report-details" maxLength={1000} rows={3} value={details}
              onChange={(e) => setDetails(e.target.value)} className={inputClass} />
          </Field>
          {error && <Notice kind="error">{error}</Notice>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send report"}</Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export function BlockButton({ userId, name, onBlocked }: { userId: number; name: string; onBlocked?: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function block() {
    setBusy(true);
    setError(null);
    try {
      await api.block(userId);
      setOpen(false);
      onBlocked?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't block this person.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)} className="min-h-9 px-3 text-sm">Block</Button>
      {open && (
        <Dialog title={`Block ${name}?`} onClose={() => setOpen(false)}>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>You won&apos;t see each other in Discover, on profiles, or in Memories.</li>
            <li>Neither of you can send friend requests or messages. If you&apos;re friends, that ends.</li>
            <li>You won&apos;t get notifications from them. They aren&apos;t told that you blocked them.</li>
            <li>In a group or event you&apos;re both in, you can still both see the member list. Your group posts are hidden from each other.</li>
          </ul>
          <p className="mt-2 text-sm">You can unblock them in Settings → Blocked people.</p>
          {error && <div className="mt-2"><Notice kind="error">{error}</Notice></div>}
          <div className="mt-4 flex gap-2">
            <Button variant="danger" onClick={block} disabled={busy}>{busy ? "Blocking…" : "Block"}</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
