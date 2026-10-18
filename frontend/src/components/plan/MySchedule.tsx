"use client";

// The "My schedule" tab: your private commitments, buffer time, imports, and who may plan around them.
import Link from "next/link";
import { useState } from "react";
import Dialog from "@/components/Dialog";
import { Empty, ErrorBox, Loading, Notice } from "@/components/States";
import { Button, Chip, Field, inputClass } from "@/components/ui";
import { type Commitment, isoDay, planning, WEEKDAYS } from "@/lib/planning";
import { useApi } from "@/lib/useApi";
import CommitmentForm, { KIND_LABELS } from "./CommitmentForm";
import PlanningConsents from "./PlanningConsents";
import ScheduleImport from "./ScheduleImport";

const BUFFERS = [0, 10, 15, 20, 30, 45, 60, 90, 120];

function when(c: Commitment) {
  const times = `${c.start_time}–${c.end_time}${c.overnight ? " (next day)" : ""}`;
  if (c.recurrence === "weekly") {
    const range = c.end_date ? `${c.start_date} to ${c.end_date}` : `from ${c.start_date}`;
    return `Every ${WEEKDAYS[c.weekday ?? 0]}, ${times} · ${range}`;
  }
  return `${c.start_date}, ${times}`;
}

export default function MySchedule() {
  const { data, error, loading, reload } = useApi(() => planning.commitments(), []);
  const [editing, setEditing] = useState<Commitment | "new" | null>(null);
  const [deleting, setDeleting] = useState<Commitment | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove(c: Commitment) {
    setBusy(true);
    try {
      await planning.deleteCommitment(c.id);
      setMessage({ kind: "success", text: `Deleted “${c.title}”.` });
      reload();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Couldn't delete it." });
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  async function changeBuffer(minutes: number) {
    try {
      await planning.setBuffer(minutes);
      setMessage({ kind: "success", text: `Buffer saved: ${minutes} minutes.` });
      reload();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Couldn't save the buffer." });
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-5">
        <section aria-labelledby="schedule-title" className="rounded-frame bg-bark p-5 text-cream sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="schedule-title" className="text-2xl font-bold">My private schedule</h2>
            <Button variant="light" onClick={() => setEditing("new")}>+ Add</Button>
          </div>
          <p className="mt-1 text-sm opacity-90">
            Only you can see this. It&apos;s used to work out when you&apos;re free, and only shared as free times
            with the people you allow below.
          </p>
          {loading && <Loading />}
          {error && <ErrorBox message={error} onRetry={reload} />}
          {data && data.commitments.length === 0 && (
            <div className="mt-4 rounded-2xl bg-cream text-bark">
              <Empty title="No commitments yet">Add your classes and shifts, or import them, so plans avoid them.</Empty>
            </div>
          )}
          <ul className="mt-4 space-y-2">
            {data?.commitments.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 rounded-inner bg-cream px-4 py-3 text-bark">
                <div className="min-w-0">
                  <p className="font-semibold">{c.title} <Chip>{KIND_LABELS[c.kind]}</Chip></p>
                  <p className="text-sm">{when(c)}</p>
                  {c.location && <p className="text-xs">Place: {c.location} (private)</p>}
                  {c.source !== "manual" && <p className="text-xs opacity-75">Imported from {c.source === "ai" ? "a timetable (Gemini)" : "a calendar file"}</p>}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="min-h-9 px-3 text-sm" onClick={() => setEditing(c)}>Edit</Button>
                  <Button variant="danger" className="min-h-9 px-3 text-sm" onClick={() => setDeleting(c)}>Delete</Button>
                </div>
              </li>
            ))}
          </ul>
          {message && <div className="mt-3"><Notice kind={message.kind}>{message.text}</Notice></div>}
        </section>

        {data && (
          <section aria-labelledby="buffer-title" className="rounded-frame bg-cream p-5">
            <h2 id="buffer-title" className="text-xl font-bold">Travel and buffer time</h2>
            <Field label="Keep this much time free before and after each commitment" htmlFor="buffer"
              hint={`Times are in ${data.timezone}.`}>
              <select id="buffer" value={data.buffer_minutes} onChange={(e) => changeBuffer(Number(e.target.value))}
                className={`${inputClass} sm:max-w-xs`}>
                {BUFFERS.map((m) => <option key={m} value={m}>{m === 0 ? "No buffer" : `${m} minutes`}</option>)}
              </select>
            </Field>
            <p className="mt-2 text-xs">
              Wrong time zone? Change it in <Link href="/settings" className="font-semibold underline">Settings</Link>.
            </p>
          </section>
        )}
      </div>

      <div className="space-y-5">
        <ScheduleImport onSaved={(text) => { setMessage({ kind: "success", text }); reload(); }} />
        <PlanningConsents />
      </div>

      {editing && data && (
        <Dialog title={editing === "new" ? "Add a commitment" : `Edit “${editing.title}”`} onClose={() => setEditing(null)}>
          <CommitmentForm existing={editing === "new" ? undefined : editing} today={isoDay()} timezone={data.timezone}
            onCancel={() => setEditing(null)}
            onSaved={() => { setEditing(null); setMessage({ kind: "success", text: "Saved." }); reload(); }} />
        </Dialog>
      )}
      {deleting && (
        <Dialog title={`Delete “${deleting.title}”?`} onClose={() => setDeleting(null)}>
          <p>{deleting.recurrence === "weekly" ? "This removes every week of it." : "This removes it from your schedule."}</p>
          <div className="mt-4 flex gap-2">
            <Button variant="danger" disabled={busy} onClick={() => remove(deleting)}>{busy ? "Deleting…" : "Delete"}</Button>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
