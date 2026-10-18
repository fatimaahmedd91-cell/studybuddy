"use client";

// The "Plan a hangout" tab: pick friends or a group, find times that work for everyone,
// get suggestions, find a halfway meeting area, and turn a time into an event.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Avatar from "@/components/Avatar";
import Dialog from "@/components/Dialog";
import { Empty, ErrorBox, Loading, Notice } from "@/components/States";
import { Button, Field, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import {
  clock,
  dayLabel,
  isoDay,
  type ParticipantStatus,
  type PlanPeople,
  type PlanRequest,
  type PlanResult,
  planning,
  type Slot,
  type Suggestion,
} from "@/lib/planning";
import { useApi } from "@/lib/useApi";
import { HalfwayArea, MyMeetingArea } from "./MeetingArea";

const DURATIONS = [30, 60, 90, 120, 180, 240];
const MAX_FRIENDS = 10;
const MAX_CHOSEN = 5;

const STATUS_LABELS: Record<ParticipantStatus, string> = {
  included: "Included",
  public_only: "Public times only",
  no_availability: "Not shared",
};

const FALLBACK_REASONS: Record<string, string> = {
  ai_off: "AI features are off for someone in this plan",
  not_configured: "Gemini isn't set up on this server",
  quota: "Gemini's free limit was reached",
  timeout: "Gemini took too long to answer",
  invalid_response: "Gemini's answer couldn't be used",
  error: "Gemini had a problem",
  rate_limited: "you've asked for a lot of suggestions recently",
};

function length(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

export default function PlanHangout() {
  const me = useMe();
  const friends = useApi(() => api.friends(), []);
  const groups = useApi(() => api.groups({ mine: true }), []);
  const [mode, setMode] = useState<"friends" | "group">("friends");
  const [friendIds, setFriendIds] = useState<number[]>([]);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(isoDay(0));
  const [endDate, setEndDate] = useState(isoDay(6));
  const [duration, setDuration] = useState(60);
  const [result, setResult] = useState<{ plan: PlanResult; request: PlanRequest } | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [eventSlot, setEventSlot] = useState<Slot | null>(null);

  const people: PlanPeople = mode === "friends" ? { friend_ids: friendIds } : { group_id: groupId ?? undefined };

  function toggleFriend(id: number) {
    setFriendIds(friendIds.includes(id) ? friendIds.filter((f) => f !== id) : friendIds.length < MAX_FRIENDS ? [...friendIds, id] : friendIds);
  }

  async function findTimes(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "friends" && friendIds.length === 0) return setError("Pick at least one friend.");
    if (mode === "group" && !groupId) return setError("Pick a group.");
    if (endDate < startDate) return setError("The end date must be on or after the start date.");
    setBusy(true);
    setSuggestion(null);
    const request: PlanRequest = { ...people, start_date: startDate, end_date: endDate, duration_minutes: duration };
    try {
      const plan = await planning.slots(request);
      setResult({ plan, request });
      setChosen(plan.slots.slice(0, MAX_CHOSEN).map((s) => s.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't work out the times.");
    } finally {
      setBusy(false);
    }
  }

  async function getSuggestions(refresh = false) {
    if (!result) return;
    setSuggesting(true);
    setSuggestError(null);
    try {
      const slots = result.plan.slots.filter((s) => chosen.includes(s.id)).map((s) => ({ start: s.start, end: s.end }));
      setSuggestion(await planning.suggest({ ...result.request, slots, refresh }));
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : "Couldn't get suggestions.");
    } finally {
      setSuggesting(false);
    }
  }

  const tz = result?.plan.timezone ?? me.timezone;
  const byDay = new Map<string, Slot[]>();
  for (const slot of result?.plan.slots ?? []) {
    const key = dayLabel(slot.start, tz);
    byDay.set(key, [...(byDay.get(key) ?? []), slot]);
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="min-w-0 space-y-5">
        <form onSubmit={findTimes} noValidate className="space-y-4 rounded-frame bg-cream p-5">
          <h2 className="text-xl font-bold">Who&apos;s coming?</h2>
          <fieldset>
            <legend className="sr-only">Plan with</legend>
            <div className="flex flex-wrap gap-x-5">
              {([["friends", "Friends"], ["group", "A group"]] as const).map(([m, label]) => (
                <label key={m} className="flex min-h-11 items-center gap-2">
                  <input type="radio" name="plan-mode" checked={mode === m} onChange={() => setMode(m)} className="h-5 w-5 accent-bark" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          {mode === "friends" ? (
            <div>
              {friends.loading && <Loading />}
              {friends.error && <ErrorBox message={friends.error} onRetry={friends.reload} />}
              {friends.data && friends.data.friends.length === 0 && (
                <Empty title="No friends yet">Plans are with friends. <Link href="/feed" className="font-semibold underline">Find people</Link></Empty>
              )}
              <fieldset>
                <legend className="text-sm font-semibold">Friends (up to {MAX_FRIENDS})</legend>
                <ul className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {friends.data?.friends.map(({ person }) => (
                    <li key={person.id}>
                      <label className="flex min-h-11 items-center gap-2 rounded-xl px-2 hover:bg-sky">
                        <input type="checkbox" checked={friendIds.includes(person.id)} onChange={() => toggleFriend(person.id)}
                          className="h-5 w-5 accent-bark" />
                        <Avatar person={person} size="xs" />
                        <span className="truncate">{person.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            </div>
          ) : (
            <Field label="Group" htmlFor="plan-group">
              <select id="plan-group" value={groupId ?? ""} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}
                className={inputClass}>
                <option value="">Pick one of your groups</option>
                {(groups.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="From" htmlFor="plan-start">
              <input id="plan-start" type="date" value={startDate} min={isoDay(0)} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
            </Field>
            <Field label="To" htmlFor="plan-end" hint="Up to 14 days.">
              <input id="plan-end" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
            </Field>
            <Field label="How long?" htmlFor="plan-duration">
              <select id="plan-duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputClass}>
                {DURATIONS.map((d) => <option key={d} value={d}>{length(d)}</option>)}
              </select>
            </Field>
          </div>
          {error && <Notice kind="error">{error}</Notice>}
          <Button type="submit" disabled={busy}>{busy ? "Working it out…" : "Find times"}</Button>
          <p className="text-xs">
            Times come from people&apos;s public free times, and from private schedules only where they&apos;ve allowed
            it. Nobody&apos;s commitments or reasons are shown.
          </p>
        </form>

        {result && (
          <section aria-labelledby="slots-title" className="space-y-4 rounded-frame bg-bark p-5 text-cream sm:p-6">
            <h2 id="slots-title" className="text-2xl font-bold">Times that work for everyone</h2>
            <p className="text-sm opacity-90">Times in {tz}. Worked out exactly from schedules, not by AI.</p>
            <ul className="flex flex-wrap gap-2" aria-label="Who's included">
              {result.plan.participants.map((p) => (
                <li key={p.person.id} title={p.note}
                  className="flex items-center gap-2 rounded-full bg-cream py-1 pl-1 pr-3 text-sm text-bark">
                  <Avatar person={p.person} size="xs" />
                  <span>{p.person.name.split(" ")[0]}: <b>{STATUS_LABELS[p.status]}</b></span>
                </li>
              ))}
            </ul>
            {result.plan.participants.some((p) => p.status !== "included") && (
              <ul className="space-y-1 text-xs opacity-90">
                {result.plan.participants.filter((p) => p.status !== "included").map((p) => (
                  <li key={p.person.id}>{p.person.name}: {p.note}</li>
                ))}
              </ul>
            )}
            {result.plan.message && <Notice kind="info">{result.plan.message}</Notice>}
            {result.plan.slots.length === 0 && !result.plan.message && (
              <Notice kind="info">No shared free time that long in these dates. Try other dates or a shorter time.</Notice>
            )}
            {[...byDay.entries()].map(([day, slots]) => (
              <div key={day}>
                <h3 className="font-semibold">{day}</h3>
                <ul className="mt-1 space-y-2">
                  {slots.map((slot) => (
                    <li key={slot.id} className="flex flex-wrap items-center justify-between gap-2 rounded-inner bg-cream px-3 py-2 text-bark">
                      <label className="flex min-h-11 items-center gap-2">
                        <input type="checkbox" checked={chosen.includes(slot.id)} className="h-5 w-5 accent-bark"
                          aria-label={`Use ${clock(slot.start, tz)} to ${clock(slot.end, tz)} for suggestions`}
                          onChange={() => setChosen(chosen.includes(slot.id) ? chosen.filter((c) => c !== slot.id)
                            : chosen.length < MAX_CHOSEN ? [...chosen, slot.id] : chosen)} />
                        <span><b>{clock(slot.start, tz)} – {clock(slot.end, tz)}</b> <span className="text-sm">({length(slot.minutes)} free)</span></span>
                      </label>
                      <Button variant="dark" className="min-h-9 px-3 text-sm" onClick={() => setEventSlot(slot)}>Create event</Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {result.plan.slots.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="light" disabled={suggesting || chosen.length === 0} onClick={() => getSuggestions(false)}>
                  {suggesting ? "Thinking…" : "Get suggestions"}
                </Button>
                <span className="text-xs opacity-90">Uses the ticked times (up to {MAX_CHOSEN}).</span>
              </div>
            )}
            {suggestError && <Notice kind="error">{suggestError}</Notice>}
          </section>
        )}

        {suggestion && (
          <SuggestionCard suggestion={suggestion} tz={tz} refreshing={suggesting}
            onRefresh={() => getSuggestions(true)} onUseSlot={(slot) => setEventSlot(slot)} />
        )}
      </div>

      <div className="min-w-0 space-y-5">
        <MyMeetingArea />
        {result && (
          <HalfwayArea key={JSON.stringify(result.request)} people={people}
            defaultActivity={suggestion?.activities[0]?.title ?? ""} />
        )}
      </div>

      {eventSlot && result && (
        <Dialog title="Create an event" onClose={() => setEventSlot(null)}>
          <PlanEventForm slot={eventSlot} tz={tz} duration={result.request.duration_minutes}
            suggestedTitle={suggestion?.activities[0]?.title ?? "Hangout"}
            invitees={result.plan.context.type === "friends" ? result.plan.participants.map((p) => p.person) : []}
            groupId={result.plan.context.group_id} onClose={() => setEventSlot(null)} />
        </Dialog>
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  tz,
  refreshing,
  onRefresh,
  onUseSlot,
}: {
  suggestion: Suggestion;
  tz: string;
  refreshing: boolean;
  onRefresh: () => void;
  onUseSlot: (slot: Slot) => void;
}) {
  return (
    <section aria-labelledby="suggest-title" className="space-y-3 rounded-frame border-2 border-bark bg-cream p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="suggest-title" className="text-xl font-bold">Suggestions</h2>
        <p className="inline-block rounded-full bg-bark px-3 py-1 text-xs font-semibold text-cream">
          {suggestion.source === "gemini"
            ? "✨ Written by Gemini"
            : `Suggested by Meetkat (not AI): ${FALLBACK_REASONS[suggestion.fallback_reason ?? "error"] ?? "Gemini unavailable"}`}
        </p>
      </div>
      <p className="text-lg">{suggestion.summary}</p>
      {suggestion.ranked_slots.length > 0 && (
        <div>
          <p className="text-sm font-semibold">Best times</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            {suggestion.ranked_slots.map((s) => (
              <li key={s.id}>{dayLabel(s.start, tz)}, {clock(s.start, tz)} – {clock(s.end, tz)}</li>
            ))}
          </ol>
        </div>
      )}
      <div>
        <p className="text-sm font-semibold">Ideas</p>
        <ul className="mt-1 space-y-1">
          {suggestion.activities.map((a) => <li key={a.title}><b>{a.title}</b>: {a.reason}</li>)}
        </ul>
      </div>
      {suggestion.plan.slot && (
        <div className="rounded-inner bg-sky px-4 py-3">
          <p className="text-sm font-semibold">Suggested plan</p>
          <p>{suggestion.plan.text}</p>
          <Button variant="dark" className="mt-2 min-h-9 px-3 text-sm" onClick={() => onUseSlot(suggestion.plan.slot!)}>Make this an event</Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span>Updated at {clock(suggestion.generated_at)}{suggestion.cached ? " (saved: refreshes after an hour or when anything changes)" : ""}.</span>
        <Button variant="outline" className="min-h-9 px-3 text-sm" disabled={refreshing} onClick={onRefresh}>Refresh</Button>
      </div>
      {suggestion.facts_sent && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">What was sent to Gemini?</summary>
          <p className="mt-1">Only these shared facts, with no names, schedules or locations:</p>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-lg bg-sand p-2 text-xs">{JSON.stringify(suggestion.facts_sent, null, 2)}</pre>
        </details>
      )}
    </section>
  );
}

function toInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PlanEventForm({
  slot,
  tz,
  duration,
  suggestedTitle,
  invitees,
  groupId,
  onClose,
}: {
  slot: Slot;
  tz: string;
  duration: number;
  suggestedTitle: string;
  invitees: { id: number; name: string }[];
  groupId: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const slotEnd = new Date(slot.end).getTime();
  const defaultEnd = new Date(Math.min(new Date(slot.start).getTime() + duration * 60_000, slotEnd)).toISOString();
  const [title, setTitle] = useState(suggestedTitle.slice(0, 80));
  const [start, setStart] = useState(toInput(slot.start));
  const [end, setEnd] = useState(toInput(defaultEnd));
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [invite, setInvite] = useState<number[]>(invitees.map((p) => p.id));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 3) return setError("Give it a title (at least 3 characters).");
    if (!location.trim()) return setError("Add where you'll meet: a public place is best.");
    setSaving(true);
    setError(null);
    try {
      const created = await planning.createEvent({
        title: title.trim(), description, starts_at: new Date(start).toISOString(), ends_at: end ? new Date(end).toISOString() : null,
        location: location.trim(), online_url: "", invitee_ids: invite, group_id: groupId,
      });
      onClose();
      router.push(`/events?id=${created.event.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the event.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <p className="text-sm">Free {dayLabel(slot.start, tz)}, {clock(slot.start, tz)} – {clock(slot.end, tz)} ({tz}).</p>
      <Field label="Title" htmlFor="plan-event-title">
        <input id="plan-event-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Starts" htmlFor="plan-event-start">
          <input id="plan-event-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Ends" htmlFor="plan-event-end">
          <input id="plan-event-end" type="datetime-local" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="Where" htmlFor="plan-event-location" hint="Events are visible to everyone on Meetkat, like other events. Pick a public place.">
        <input id="plan-event-location" value={location} maxLength={120} placeholder="Library café"
          onChange={(e) => setLocation(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Notes (optional)" htmlFor="plan-event-description">
        <textarea id="plan-event-description" value={description} maxLength={1000} rows={2}
          onChange={(e) => setDescription(e.target.value)} className={inputClass} />
      </Field>
      {invitees.length > 0 && (
        <fieldset>
          <legend className="text-sm font-semibold">Invite</legend>
          {invitees.map((p) => (
            <label key={p.id} className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={invite.includes(p.id)} className="h-5 w-5 accent-bark"
                onChange={() => setInvite(invite.includes(p.id) ? invite.filter((i) => i !== p.id) : [...invite, p.id])} />
              {p.name}
            </label>
          ))}
        </fieldset>
      )}
      {groupId && <p className="text-sm">Everyone in the group gets a notification about the new event.</p>}
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create event and invite"}</Button>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}
