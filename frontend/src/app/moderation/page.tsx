"use client";

// The moderators' area: report queue, actions, the action log, and (for admins) privacy requests.
// Hiding this page from members is just tidiness: the server refuses every moderation call from non-moderators.
import Link from "next/link";
import { useState } from "react";
import Avatar from "@/components/Avatar";
import Dialog from "@/components/Dialog";
import { Empty, ErrorBox, Loading, Notice } from "@/components/States";
import { Button, Field, FrameCard, PageHeading, inputClass } from "@/components/ui";
import { get, send } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { formatDateTime } from "@/lib/time";
import type { MiniProfile } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type Person = MiniProfile & { suspended: boolean };
type Report = {
  id: number;
  target_type: string;
  target_id: number;
  reason_label: string;
  details: string;
  snapshot: string;
  current_content: string | null;
  reported_person: Person | null;
  reporter: Person | null;
  status: string;
  created_at: string;
  handled_at: string | null;
};
type Action = { id: number; action: string; target_type: string; target_id: number | null; note: string; created_at: string; moderator_name: string | null };
type PrivacyRequestRow = { id: number; kind: string; details: string; contact_email: string; user_name: string | null; created_at: string };

const STATUSES = ["open", "actioned", "dismissed"] as const;

function ReportCard({ report, onDone }: { report: Report; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(path: string, body: object) {
    setBusy(true);
    setError(null);
    try {
      await send("POST", path, body);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
      setBusy(false);
    }
  }

  const person = report.reported_person;
  return (
    <FrameCard>
      <article className="space-y-2 p-4 sm:p-5">
        <p className="text-sm">#{report.id} · {formatDateTime(report.created_at)} · <b>{report.target_type.replace("_", " ")}</b></p>
        <h2 className="text-xl font-bold">{report.reason_label}</h2>
        {report.details && <p><span className="font-semibold">Reporter says:</span> {report.details}</p>}
        <div className="rounded-xl bg-cream p-3 text-sm">
          <p className="font-semibold">When reported:</p>
          <p className="whitespace-pre-wrap break-words">{report.snapshot || "(nothing saved)"}</p>
          <p className="mt-2 font-semibold">Now:</p>
          <p className="whitespace-pre-wrap break-words">{report.current_content ?? "(already removed)"}</p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {person && (
            <span className="flex items-center gap-2">
              <Avatar person={person} size="xs" /> About:{" "}
              <Link href={`/profile?id=${person.id}`} className="font-semibold underline">{person.name}</Link>
              {person.suspended && <b className="text-danger">(suspended)</b>}
            </span>
          )}
          {report.reporter && <span>Reported by: <b>{report.reporter.name}</b> (never shown to the reported person)</span>}
        </div>
        {report.status === "open" ? (
          <>
            <Field label="Note for the log (optional)" htmlFor={`note-${report.id}`}>
              <input id={`note-${report.id}`} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} className={inputClass} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={() => act(`/api/moderation/reports/${report.id}/dismiss`, { note })}>
                Dismiss
              </Button>
              <Button variant="danger" disabled={busy} onClick={() => act(`/api/moderation/reports/${report.id}/remove-content`, { note })}>
                Remove content
              </Button>
              {person && !person.suspended && (
                <Button variant="danger" disabled={busy} onClick={() => setSuspending(true)}>Suspend {person.name}</Button>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm">Handled {report.handled_at && formatDateTime(report.handled_at)} ({report.status}).</p>
        )}
        {error && <Notice kind="error">{error}</Notice>}
      </article>
      {suspending && person && (
        <Dialog title={`Suspend ${person.name}?`} onClose={() => setSuspending(false)}>
          <p className="text-sm">They won&apos;t be able to log in or use Meetkat until a moderator unsuspends them.</p>
          <Field label="Reason (saved in the log)" htmlFor="suspend-reason">
            <input id="suspend-reason" value={reason} minLength={3} maxLength={500} onChange={(e) => setReason(e.target.value)} className={inputClass} />
          </Field>
          <div className="mt-3 flex gap-2">
            <Button variant="danger" disabled={busy || reason.trim().length < 3}
              onClick={() => act(`/api/moderation/users/${person.id}/suspend`, { reason, report_id: report.id })}>Suspend</Button>
            <Button variant="outline" onClick={() => setSuspending(false)}>Cancel</Button>
          </div>
        </Dialog>
      )}
    </FrameCard>
  );
}

function PrivacyQueue() {
  const { data, error, loading, reload } = useApi(() => get<PrivacyRequestRow[]>("/api/moderation/privacy-requests"), []);
  return (
    <section aria-labelledby="privacy-title" className="space-y-3">
      <h2 id="privacy-title" className="text-2xl font-bold">Privacy requests</h2>
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.length === 0 && <Empty title="No open privacy requests." />}
      {data?.map((r) => (
        <div key={r.id} className="rounded-xl bg-cream p-3">
          <p><b>{r.kind}</b> from {r.user_name ?? "a deleted account"} ({r.contact_email}) · {formatDateTime(r.created_at)}</p>
          {r.details && <p className="mt-1 whitespace-pre-wrap text-sm">{r.details}</p>}
          <Button variant="outline" className="mt-2" onClick={async () => {
            await send("POST", `/api/moderation/privacy-requests/${r.id}/done`, {});
            reload();
          }}>Mark as handled</Button>
        </div>
      ))}
    </section>
  );
}

export default function ModerationPage() {
  const me = useMe();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("open");
  const reports = useApi(() => get<Report[]>(`/api/moderation/reports?status=${status}`), [status]);
  const log = useApi(() => get<Action[]>("/api/moderation/actions"), []);

  if (me.role === "member") {
    return <Notice kind="info">This area is only for Meetkat moderators.</Notice>;
  }
  const refresh = () => {
    reports.reload();
    log.reload();
  };

  return (
    <div className="space-y-6">
      <PageHeading title="Moderation" />
      <p className="text-sm">
        Reports wait here until a person reviews them. There&apos;s no automatic or round-the-clock moderation.
        Every action is recorded in the log below.
      </p>
      <div role="tablist" aria-label="Report status" className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button key={s} role="tab" aria-selected={status === s} onClick={() => setStatus(s)}
            className={`min-h-11 rounded-full border-2 border-bark px-4 font-semibold capitalize ${status === s ? "bg-bark text-cream" : "bg-cream"}`}>
            {s}
          </button>
        ))}
      </div>
      {reports.loading && <Loading />}
      {reports.error && <ErrorBox message={reports.error} onRetry={reports.reload} />}
      {reports.data && reports.data.length === 0 && <Empty title={`No ${status} reports.`} />}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {reports.data?.map((r) => <ReportCard key={r.id} report={r} onDone={refresh} />)}
      </div>

      {me.role === "admin" && <PrivacyQueue />}

      <section aria-labelledby="log-title" className="space-y-2">
        <h2 id="log-title" className="text-2xl font-bold">Action log</h2>
        {log.data && log.data.length === 0 && <Empty title="No actions yet." />}
        <ul className="space-y-1 text-sm">
          {log.data?.map((a) => (
            <li key={a.id} className="rounded-lg bg-cream px-3 py-2">
              {formatDateTime(a.created_at)} · <b>{a.moderator_name ?? "a deleted moderator"}</b> · {a.action.replaceAll("_", " ")}
              {a.target_type && ` · ${a.target_type} #${a.target_id}`}{a.note && ` · “${a.note}”`}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
