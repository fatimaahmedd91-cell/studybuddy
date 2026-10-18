"use client";

// Events: calendar, list, RSVP, planning (/events) and one event's page (/events?id=4).
// Times are shown in your own time zone.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import Avatar from "@/components/Avatar";
import { EventForm } from "@/components/CreateForms";
import Dialog from "@/components/Dialog";
import { AvailabilityGrid } from "@/components/ProfileInputs";
import { Empty, ErrorBox, Loading, Notice } from "@/components/States";
import { Button, DarkPanel, DemoBadge, FrameCard, inputClass } from "@/components/ui";
import { ReportButton } from "@/components/SafetyActions";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { useOptions } from "@/lib/options";
import { formatDateTime, formatTime, myTimeZone } from "@/lib/time";
import type { FriendEvent } from "@/lib/types";
import { useApi } from "@/lib/useApi";

function RsvpButton({ event, onChange }: { event: FriendEvent; onChange: (e: FriendEvent) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (event.has_ended) return <span className="text-sm font-semibold">This event has ended</span>;
  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      onChange(event.is_going ? await api.cancelRsvp(event.id) : await api.rsvp(event.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <Button onClick={toggle} disabled={busy} variant={event.is_going ? "light" : "dark"} aria-pressed={event.is_going}>
        {busy ? "…" : event.is_going ? "Going ✓ · Cancel RSVP" : "I'm going"}
      </Button>
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}

function Where({ event }: { event: FriendEvent }) {
  return event.online_url ? (
    <a href={event.online_url} target="_blank" rel="noopener noreferrer" className="underline">Online link ↗</a>
  ) : (
    <span>{event.location}</span>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Calendar({ events }: { events: FriendEvent[] }) {
  const [shown, setShown] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const year = shown.getFullYear();
  const month = shown.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(shown.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => new Date(year, month, i + 1))];
  const today = new Date().toDateString();
  const onDay = (d: Date) => events.filter((e) => new Date(e.starts_at).toDateString() === d.toDateString());

  return (
    <section aria-labelledby="calendar-title" className="rounded-frame bg-cream p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-bark pb-3">
        <h2 id="calendar-title" className="text-3xl tracking-[0.2em]">CALENDAR</h2>
        <div className="flex items-center gap-1">
          <button aria-label="Previous month" onClick={() => setShown(new Date(year, month - 1, 1))} className="h-11 w-11 rounded-full text-2xl hover:bg-sky">‹</button>
          <span className="w-36 text-center font-semibold">{shown.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
          <button aria-label="Next month" onClick={() => setShown(new Date(year, month + 1, 1))} className="h-11 w-11 rounded-full text-2xl hover:bg-sky">›</button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-7 text-center text-xs font-semibold" aria-hidden="true">
        {WEEKDAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 border-l-2 border-t-2 border-bark">
        {cells.map((date, i) => {
          const list = date ? onDay(date) : [];
          return (
            <div key={i} className={`min-h-[64px] border-b-2 border-r-2 border-bark p-1 sm:min-h-[80px] ${date?.toDateString() === today ? "bg-sky" : ""}`}>
              {date && (
                <>
                  <p className="text-xs font-semibold">{date.getDate()}</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {list.slice(0, 2).map((e) => (
                      <li key={e.id}>
                        <Link href={`/events?id=${e.id}`} title={`${e.title}, ${formatTime(e.starts_at)}`}
                          className="block truncate rounded bg-bark px-1 text-[10px] leading-4 text-cream">
                          {e.title}
                        </Link>
                      </li>
                    ))}
                    {list.length > 2 && <li className="text-[10px]">+{list.length - 2} more</li>}
                  </ul>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FriendTime() {
  const { options } = useOptions();
  const friends = useApi(() => api.friends(), []);
  const [friendId, setFriendId] = useState<number | null>(null);
  const person = useApi(() => (friendId ? api.person(friendId) : Promise.resolve(null)), [friendId]);

  return (
    <section aria-labelledby="friend-time-title" className="rounded-frame bg-sky-strong p-5 text-bark">
      <h2 id="friend-time-title" className="text-2xl font-bold">View a friend&apos;s free time</h2>
      {friends.data && friends.data.friends.length === 0 ? (
        <p className="mt-2 text-xl font-bold">Add friends to compare when you&apos;re both free.</p>
      ) : (
        <>
          <label className="mt-2 block text-xl font-bold">
            Compare with
            <select value={friendId ?? ""} onChange={(e) => setFriendId(e.target.value ? Number(e.target.value) : null)}
              className={`${inputClass} mt-1 text-base`}>
              <option value="">Pick a friend…</option>
              {friends.data?.friends.map(({ person: p }) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {person.data && options && (
            <div className="mt-3 rounded-xl bg-cream p-2 text-bark">
              {person.data.match.overlap.length ? (
                <AvailabilityGrid days={options.days} slots={options.slots} value={{}} highlight={person.data.match.overlap} />
              ) : (
                <p className="p-2 text-sm">You don&apos;t have any free times in common yet.</p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function EventList({ cancelled }: { cancelled: string | null }) {
  const me = useMe();
  const router = useRouter();
  const { options } = useOptions();
  const [when, setWhen] = useState<"upcoming" | "past">("upcoming");
  const [planning, setPlanning] = useState(false);
  const { data, error, loading, reload, setData } = useApi(() => api.events({ when }), [when]);
  const replace = (e: FriendEvent) => setData((data ?? []).map((x) => (x.id === e.id ? e : x)));
  const events = useMemo(() => data ?? [], [data]);

  return (
    <div>
      {cancelled !== null && (
        <div className="mb-4">
          <Notice kind="success">
            Event cancelled.{" "}
            {Number(cancelled) > 0
              ? `${cancelled} ${Number(cancelled) === 1 ? "person who was going was" : "people who were going were"} notified.`
              : "Nobody else needed to be notified."}
          </Notice>
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-bold sm:text-4xl">Events</h1>
        <div role="group" aria-label="Which events" className="inline-flex rounded-xl border-2 border-bark p-1">
          {(["upcoming", "past"] as const).map((w) => (
            <button key={w} aria-pressed={when === w} onClick={() => setWhen(w)}
              className={`min-h-10 rounded-lg px-4 text-sm font-semibold capitalize ${when === w ? "bg-bark text-cream" : "hover:bg-cream"}`}>
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Calendar events={events} />
          <DarkPanel>
            <h2 className="text-3xl tracking-wide">{when === "upcoming" ? "Upcoming Events!" : "Past events"}</h2>
            <p className="mt-1 text-sm opacity-80">Times in {myTimeZone()}.</p>
            {loading && <Loading />}
            {error && <ErrorBox message={error} onRetry={reload} />}
            {data && events.length === 0 && <p className="mt-3">No {when} events. Plan one!</p>}
            <ul className="mt-3 space-y-3">
              {events.map((e) => (
                <li key={e.id} className="rounded-2xl bg-cream p-4 text-bark">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <Link href={`/events?id=${e.id}`} className="text-lg font-bold underline-offset-4 hover:underline">{e.title}</Link>
                      {e.is_demo && <span className="ml-2 align-middle"><DemoBadge /></span>}
                      <p className="text-sm font-semibold">{formatDateTime(e.starts_at)}</p>
                      <p className="text-sm"><Where event={e} />{e.group && <> · <Link href={`/groups?id=${e.group.id}`} className="underline">{e.group.name}</Link></>}</p>
                      <p className="text-sm">{e.going_count} going{e.organiser && ` · organised by ${e.organiser.id === me.id ? "you" : e.organiser.name}`}</p>
                    </div>
                    <RsvpButton event={e} onChange={replace} />
                  </div>
                </li>
              ))}
            </ul>
          </DarkPanel>
        </div>

        <div className="space-y-5">
          <section aria-labelledby="timetable-title" className="rounded-frame bg-sky-strong p-5 text-bark">
            <h2 id="timetable-title" className="border-b border-bark/30 pb-2 text-3xl">Your timetable</h2>
            {options && (
              <div className="mt-3 rounded-xl bg-cream p-2 text-bark">
                <AvailabilityGrid days={options.days} slots={options.slots} value={me.availability} />
              </div>
            )}
            <Link href="/profile?edit=1" className="mt-2 inline-block text-xl font-bold underline">Edit your free times</Link>
          </section>
          <FriendTime />
          <button onClick={() => setPlanning(true)}
            className="w-full rounded-[18px] bg-forest px-6 py-4 text-left text-2xl font-bold tracking-wider text-cream hover:brightness-110">
            PLAN AN EVENT!
          </button>
        </div>
      </div>

      {planning && (
        <Dialog title="Plan an event" onClose={() => setPlanning(false)}>
          <EventForm onCreated={(e) => { setPlanning(false); router.push(`/events?id=${e.id}`); }} />
        </Dialog>
      )}
    </div>
  );
}

// The organiser's Edit and Cancel buttons. The server checks it's really the organiser.
function OrganiserActions({ event, onSaved }: { event: FriendEvent; onSaved: (e: FriendEvent) => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const others = event.going_count - (event.is_going ? 1 : 0);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.cancelEvent(event.id);
      router.push(`/events?cancelled=${result.notified}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't cancel the event.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {!event.has_ended && (
          <Button variant="outline" onClick={() => { setSaved(false); setEditing(true); }}>Edit event</Button>
        )}
        <Button variant="danger" onClick={() => setCancelling(true)}>{event.has_ended ? "Delete event" : "Cancel event"}</Button>
      </div>
      {saved && <Notice kind="success">Event saved.</Notice>}
      {editing && (
        <Dialog title="Edit event" onClose={() => setEditing(false)}>
          <EventForm existing={event} onCreated={(e) => { setEditing(false); setSaved(true); onSaved(e); }} />
        </Dialog>
      )}
      {cancelling && (
        <Dialog title={event.has_ended ? `Delete “${event.title}”?` : `Cancel “${event.title}”?`} onClose={() => setCancelling(false)}>
          <div className="space-y-3">
            <p>
              {event.has_ended
                ? "It will be removed for everyone."
                : others > 0
                  ? `It will be removed, and the ${others} other ${others === 1 ? "person" : "people"} going will get a notification.`
                  : "It will be removed. Nobody else has said they're going yet."}
            </p>
            <p className="text-sm">This can&apos;t be undone.</p>
            {error && <Notice kind="error">{error}</Notice>}
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" onClick={cancel} disabled={busy}>
                {busy ? "Working…" : event.has_ended ? "Delete event" : "Cancel event"}
              </Button>
              <Button variant="outline" onClick={() => setCancelling(false)}>Keep it</Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function EventDetail({ id }: { id: number }) {
  const { data: event, error, loading, reload, setData } = useApi(() => api.event(id), [id]);
  if (loading) return <Loading label="Loading event…" />;
  if (error || !event) {
    return (
      <div className="space-y-3">
        <ErrorBox message={error ?? "This event could not be found."} onRetry={reload} />
        <Link href="/events" className="font-semibold underline">Back to events</Link>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <Link href="/events" className="font-semibold underline">← All events</Link>
      <FrameCard>
        <div className="space-y-3 p-5 sm:p-7">
          <h1 className="text-3xl font-bold sm:text-4xl">{event.title} {event.is_demo && <DemoBadge />}</h1>
          <p className="text-lg font-semibold">
            {formatDateTime(event.starts_at)}
            {event.ends_at && ` – ${formatTime(event.ends_at)}`}
          </p>
          <p className="text-lg"><Where event={event} /></p>
          {event.group && <p>Group: <Link href={`/groups?id=${event.group.id}`} className="font-semibold underline">{event.group.name}</Link></p>}
          {event.organiser && (
            <p>Organised by <Link href={`/profile?id=${event.organiser.id}`} className="font-semibold underline">{event.is_organiser ? "you" : event.organiser.name}</Link></p>
          )}
          {event.description && <p className="max-w-2xl whitespace-pre-line">{event.description}</p>}
          <RsvpButton event={event} onChange={setData} />
          {event.is_organiser
            ? <OrganiserActions event={event} onSaved={setData} />
            : <ReportButton targetType="event" targetId={event.id} label="Report event" />}
        </div>
      </FrameCard>
      <section aria-labelledby="going-title" className="rounded-2xl bg-cream p-5">
        <h2 id="going-title" className="text-xl font-bold">{event.going_count} going</h2>
        {event.attendees?.length ? (
          <ul className="mt-3 flex flex-wrap gap-3">
            {event.attendees.map((a) => (
              <li key={a.id}>
                <Link href={`/profile?id=${a.id}`} className="flex flex-col items-center gap-1 text-xs">
                  <Avatar person={a} size="sm" />
                  <span className="max-w-20 truncate">{a.name.split(" ")[0]}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Nobody yet">Be the first to RSVP.</Empty>
        )}
      </section>
    </div>
  );
}

function EventsContent() {
  const params = useSearchParams();
  const id = params.get("id");
  return id ? <EventDetail id={Number(id)} /> : <EventList cancelled={params.get("cancelled")} />;
}

export default function EventsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <EventsContent />
    </Suspense>
  );
}
