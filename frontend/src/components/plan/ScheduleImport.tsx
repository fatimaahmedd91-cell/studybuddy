"use client";

// Importing a schedule: a calendar file (.ics), or a timetable image/PDF read by Gemini.
// Imports never save anything by themselves: every entry is shown on a review screen first,
// with warnings for anything uncertain, and only the entries you keep are saved.
import { useRef, useState } from "react";
import Dialog from "@/components/Dialog";
import { Notice } from "@/components/States";
import { Button } from "@/components/ui";
import { type CommitmentInput, type Proposal, planning } from "@/lib/planning";
import { CommitmentFields, commitmentProblems } from "./CommitmentForm";

const MAX_FILE = 5 * 1024 * 1024;

const FLAG_LABELS: Record<keyof Proposal["flags"], string> = {
  uncertain_time: "Check the time",
  missing_dates: "Check the dates",
  ambiguous_recurrence: "Check how it repeats",
};

function readFile(file: File, as: "text" | "dataUrl"): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The file couldn't be read."));
    if (as === "text") reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

export default function ScheduleImport({ onSaved }: { onSaved: (message: string) => void }) {
  const icsInput = useRef<HTMLInputElement>(null);
  const aiInput = useRef<HTMLInputElement>(null);
  const [aiConsentOpen, setAiConsentOpen] = useState(false);
  const [aiChosen, setAiChosen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<{ proposals: Proposal[]; source: "ics" | "ai" } | null>(null);

  async function importIcs(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > 1_000_000) return setError("That calendar file is too big (over 1 MB).");
    setBusy("Reading your calendar file…");
    try {
      const result = await planning.importIcs(await readFile(file, "text"));
      setReview({ proposals: result.proposals, source: "ics" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setBusy(null);
      if (icsInput.current) icsInput.current.value = "";
    }
  }

  async function importWithAi(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!["image/png", "image/jpeg", "application/pdf"].includes(file.type))
      return setError("Choose a PNG or JPEG image, or a PDF.");
    if (file.size > MAX_FILE) return setError("That file is too big. The limit is 5 MB.");
    setBusy("Gemini is reading your timetable… (this can take up to a minute)");
    try {
      const result = await planning.importWithAi(await readFile(file, "dataUrl"));
      setReview({ proposals: result.proposals, source: "ai" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setBusy(null);
      if (aiInput.current) aiInput.current.value = "";
    }
  }

  return (
    <section aria-labelledby="import-title" className="space-y-3 rounded-frame bg-cream p-5">
      <h2 id="import-title" className="text-xl font-bold">Import a schedule</h2>
      <p className="text-sm">Nothing is saved until you&apos;ve reviewed it.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => icsInput.current?.click()} disabled={!!busy}>Import a calendar file (.ics)</Button>
        <Button variant="outline" onClick={() => { setAiChosen(false); setAiConsentOpen(true); }} disabled={!!busy}>
          Import a timetable image or PDF with Gemini
        </Button>
      </div>
      <input ref={icsInput} type="file" accept=".ics,text/calendar" className="sr-only" aria-label="Calendar file"
        onChange={(e) => importIcs(e.target.files?.[0])} />
      <input ref={aiInput} type="file" accept="image/png,image/jpeg,application/pdf" className="sr-only" aria-label="Timetable image or PDF"
        onChange={(e) => importWithAi(e.target.files?.[0])} />
      {busy && <Notice kind="info">{busy}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      {aiConsentOpen && (
        <Dialog title="Send your timetable to Gemini?" onClose={() => setAiConsentOpen(false)}>
          <div className="space-y-3 text-sm">
            <p>
              To extract your timetable, Meerkat will send this file to Google Gemini. It may contain class, work, location,
              and other personal information. Upload only information you are authorized to share. Review the extracted
              entries before saving.
            </p>
            <p>
              Processing and retention: <b>[TO BE CONFIRMED — see the pre-launch checklist]</b>. Meerkat itself doesn&apos;t
              store the file: it&apos;s only kept in memory while Gemini reads it.
            </p>
            <label className="flex min-h-11 items-start gap-3">
              <input type="checkbox" checked={aiChosen} onChange={(e) => setAiChosen(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-pine" />
              <span>I choose to send this file for AI-assisted schedule extraction.</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!aiChosen} onClick={() => { setAiConsentOpen(false); aiInput.current?.click(); }}>
                Continue with extraction
              </Button>
              <Button variant="outline" onClick={() => setAiConsentOpen(false)}>Enter schedule manually</Button>
            </div>
          </div>
        </Dialog>
      )}

      {review && (
        <ImportReview
          proposals={review.proposals}
          source={review.source}
          onCancel={() => setReview(null)}
          onSaved={(message) => { setReview(null); onSaved(message); }}
        />
      )}
    </section>
  );
}

type Row = { include: boolean; value: Partial<CommitmentInput>; proposal: Proposal; errors: Record<string, string> };

function ImportReview({
  proposals,
  source,
  onCancel,
  onSaved,
}: {
  proposals: Proposal[];
  source: "ics" | "ai";
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    proposals.map((p) => ({
      include: true,
      proposal: p,
      errors: {},
      value: {
        title: p.title, kind: p.kind, location: p.location, recurrence: p.recurrence, weekday: p.weekday,
        start_date: p.start_date ?? "", end_date: p.end_date, start_time: p.start_time ?? "", end_time: p.end_time ?? "",
      },
    })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (i: number, patch: Partial<Row>) => setRows(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const chosen = rows.filter((r) => r.include);

  async function save() {
    const checked = rows.map((r) => ({ ...r, errors: r.include ? commitmentProblems(r.value) : {} }));
    setRows(checked);
    if (checked.some((r) => Object.keys(r.errors).length)) {
      setError("Some entries need fixing (marked below), or untick them to skip them.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const entries = checked.filter((r) => r.include).map((r) => ({
        title: r.value.title!.trim(), kind: r.value.kind ?? "other", location: r.value.location ?? "",
        recurrence: r.value.recurrence ?? "none", weekday: r.value.recurrence === "weekly" ? r.value.weekday ?? null : null,
        start_date: r.value.start_date!, end_date: r.value.recurrence === "weekly" ? r.value.end_date || null : null,
        start_time: r.value.start_time!, end_time: r.value.end_time!, timezone: r.proposal.timezone,
        import_key: r.proposal.import_key,
      }));
      const result = await planning.saveReviewed(entries, source);
      onSaved(`Saved ${result.saved}${result.skipped_duplicates ? `, skipped ${result.skipped_duplicates} already in your schedule` : ""}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nothing was saved. Please try again.");
      setSaving(false);
    }
  }

  return (
    <Dialog title="Review before saving" onClose={onCancel}>
      <div className="space-y-4">
        <p className="text-sm">
          {source === "ai"
            ? "Gemini read these from your file. AI can misread things, so check every entry."
            : "These came from your calendar file. Check them, especially anything with a warning."}{" "}
          Untick anything you don&apos;t want.
        </p>
        <ol className="space-y-4">
          {rows.map((row, i) => {
            const flagged = Object.entries(row.proposal.flags).filter(([, on]) => on) as [keyof Proposal["flags"], boolean][];
            return (
              <li key={i} className={`rounded-inner border-2 p-3 ${row.include ? "border-forest bg-sage" : "border-pine/20 bg-sand opacity-80"}`}>
                <label className="flex min-h-11 items-center gap-2 font-semibold">
                  <input type="checkbox" checked={row.include} onChange={(e) => update(i, { include: e.target.checked })}
                    className="h-5 w-5 accent-pine" />
                  Keep “{row.value.title || "Untitled"}”
                </label>
                {flagged.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {flagged.map(([flag]) => (
                      <span key={flag} className="rounded-full border border-warning bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">
                        ⚠ {FLAG_LABELS[flag]}
                      </span>
                    ))}
                  </div>
                )}
                {row.proposal.warnings.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-xs text-warning">
                    {row.proposal.warnings.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                )}
                {row.include && (
                  <div className="mt-3">
                    <CommitmentFields value={row.value} errors={row.errors} idPrefix={`review-${i}`}
                      onChange={(value) => update(i, { value })} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving || chosen.length === 0}>
            {saving ? "Saving…" : `Save ${chosen.length} ${chosen.length === 1 ? "entry" : "entries"}`}
          </Button>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </Dialog>
  );
}
