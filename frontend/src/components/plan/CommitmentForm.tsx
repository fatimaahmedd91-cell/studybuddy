"use client";

// Add or edit one private commitment (a class, a work shift, or anything else that makes you busy).
// Also used on the import review screen to fix up proposed entries.
import { useState } from "react";
import { ErrorBox } from "@/components/States";
import { Button, Field, inputClass } from "@/components/ui";
import { type Commitment, type CommitmentInput, type CommitmentKind, planning, WEEKDAYS } from "@/lib/planning";

export const KIND_LABELS: Record<CommitmentKind, string> = { class: "Class", work: "Work shift", other: "Other" };

export function emptyCommitment(today: string): CommitmentInput {
  return {
    title: "", kind: "class", location: "", recurrence: "weekly", weekday: 0, start_date: today,
    end_date: null, start_time: "10:00", end_time: "11:00",
  };
}

// Plain-English checks before sending. The server checks everything again.
export function commitmentProblems(c: Partial<CommitmentInput>) {
  const found: Record<string, string> = {};
  if (!c.title?.trim()) found.title = "Give it a name.";
  if (!c.start_time) found.start_time = "Add a start time.";
  if (!c.end_time) found.end_time = "Add an end time.";
  if (c.start_time && c.end_time && c.start_time === c.end_time) found.end_time = "The end can't be the same as the start.";
  if (!c.start_date) found.start_date = c.recurrence === "weekly" ? "Add the first date." : "Add the date.";
  if (c.recurrence === "weekly" && (c.weekday === null || c.weekday === undefined)) found.weekday = "Pick a day.";
  if (c.recurrence === "weekly" && c.end_date && c.start_date && c.end_date < c.start_date)
    found.end_date = "The last date must be on or after the first date.";
  return found;
}

export function CommitmentFields({
  value,
  onChange,
  errors = {},
  idPrefix,
}: {
  value: Partial<CommitmentInput>;
  onChange: (next: Partial<CommitmentInput>) => void;
  errors?: Record<string, string>;
  idPrefix: string;
}) {
  const set = (patch: Partial<CommitmentInput>) => onChange({ ...value, ...patch });
  const overnight = value.start_time && value.end_time && value.end_time < value.start_time;
  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
        <Field label="Name" htmlFor={id("title")} error={errors.title}>
          <input id={id("title")} value={value.title ?? ""} maxLength={80} placeholder="CSCA08 lecture"
            onChange={(e) => set({ title: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Type" htmlFor={id("kind")}>
          <select id={id("kind")} value={value.kind ?? "other"} onChange={(e) => set({ kind: e.target.value as CommitmentKind })}
            className={inputClass}>
            {Object.entries(KIND_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </Field>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold">How often?</legend>
        <div className="mt-1 flex flex-wrap gap-x-5">
          {([["weekly", "Every week"], ["none", "Just once"]] as const).map(([r, label]) => (
            <label key={r} className="flex min-h-11 items-center gap-2">
              <input type="radio" name={id("recurrence")} checked={value.recurrence === r}
                onChange={() => set({ recurrence: r, weekday: r === "weekly" ? value.weekday ?? 0 : null })}
                className="h-5 w-5 accent-bark" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {value.recurrence === "weekly" && (
          <Field label="Day" htmlFor={id("weekday")} error={errors.weekday}>
            <select id={id("weekday")} value={value.weekday ?? ""} className={inputClass}
              onChange={(e) => set({ weekday: e.target.value === "" ? null : Number(e.target.value) })}>
              <option value="">Pick a day</option>
              {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </Field>
        )}
        <Field label="Starts" htmlFor={id("start")} error={errors.start_time}>
          <input id={id("start")} type="time" value={value.start_time ?? ""} onChange={(e) => set({ start_time: e.target.value })}
            className={inputClass} />
        </Field>
        <Field label="Ends" htmlFor={id("end")} error={errors.end_time} hint={overnight ? "Ends the next day (overnight)." : undefined}>
          <input id={id("end")} type="time" value={value.end_time ?? ""} onChange={(e) => set({ end_time: e.target.value })}
            className={inputClass} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={value.recurrence === "weekly" ? "First date" : "Date"} htmlFor={id("start-date")} error={errors.start_date}>
          <input id={id("start-date")} type="date" value={value.start_date ?? ""} onChange={(e) => set({ start_date: e.target.value })}
            className={inputClass} />
        </Field>
        {value.recurrence === "weekly" && (
          <Field label="Last date (optional)" htmlFor={id("end-date")} error={errors.end_date} hint="For example, the end of term.">
            <input id={id("end-date")} type="date" value={value.end_date ?? ""} min={value.start_date ?? undefined}
              onChange={(e) => set({ end_date: e.target.value || null })} className={inputClass} />
          </Field>
        )}
      </div>
      <Field label="Place (optional)" htmlFor={id("location")} hint="Private: only you can see this.">
        <input id={id("location")} value={value.location ?? ""} maxLength={120} placeholder="IC 130"
          onChange={(e) => set({ location: e.target.value })} className={inputClass} />
      </Field>
    </div>
  );
}

export default function CommitmentForm({
  existing,
  today,
  timezone,
  onSaved,
  onCancel,
}: {
  existing?: Commitment;
  today: string;
  timezone: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<Partial<CommitmentInput>>(existing ?? emptyCommitment(today));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = commitmentProblems(value);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setError(null);
    const body: CommitmentInput = {
      title: value.title!.trim(), kind: value.kind ?? "other", location: value.location ?? "",
      recurrence: value.recurrence ?? "none", weekday: value.recurrence === "weekly" ? value.weekday ?? null : null,
      start_date: value.start_date!, end_date: value.recurrence === "weekly" ? value.end_date || null : null,
      start_time: value.start_time!, end_time: value.end_time!,
    };
    try {
      if (existing) await planning.updateCommitment(existing.id, body);
      else await planning.addCommitment(body);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save it.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <CommitmentFields value={value} onChange={setValue} errors={errors} idPrefix={existing ? `edit-${existing.id}` : "new"} />
      <p className="text-xs">Times are in your time zone, {timezone}. You can change it in Settings.</p>
      {error && <ErrorBox message={error} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : existing ? "Save changes" : "Add"}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
