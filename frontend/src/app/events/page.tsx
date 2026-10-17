"use client";

// Events: a month calendar, your timetable, friends' timetables, planning, and what's coming up.
import { useEffect, useMemo, useRef, useState } from "react";
import Timetable from "@/components/Timetable";
import { DarkButton, PageTitle } from "@/components/ui";
import { EVENT_YEAR, SLOTS, type Slot, events, formatDate, parseEventDate } from "@/lib/data";
import { type PlannedEvent, useMatches, useStore } from "@/lib/store";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type CalendarItem = { key: string; title: string; date: Date; detail: string };

// "2026-10-24" -> Date at local midnight (new Date("2026-10-24") would use UTC).
function fromInput(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function Calendar({ items }: { items: CalendarItem[] }) {
  const [month, setMonth] = useState(9); // October, where the demo events are
  const year = EVENT_YEAR;
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];

  return (
    <section className="rounded-[22px] bg-paper p-4 sm:p-6" aria-labelledby="calendar-title">
      <div className="flex items-center justify-between border-b-2 border-bark pb-3">
        <h2 id="calendar-title" className="text-3xl tracking-[0.2em] sm:text-4xl">
          CALENDAR
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(Math.max(0, month - 1))} aria-label="Previous month" className="rounded-full px-3 py-1 text-xl hover:bg-card">
            ‹
          </button>
          <span className="w-28 text-center font-semibold">
            {MONTH_NAMES[month]} {year}
          </span>
          <button onClick={() => setMonth(Math.min(11, month + 1))} aria-label="Next month" className="rounded-full px-3 py-1 text-xl hover:bg-card">
            ›
          </button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-7 text-center text-xs font-semibold">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-l-2 border-t-2 border-bark">
        {cells.map((date, i) => {
          const todays = date ? items.filter((it) => sameDay(it.date, date)) : [];
          return (
            <div key={i} className="min-h-[72px] border-b-2 border-r-2 border-bark p-1 sm:min-h-[84px]">
              {date && (
                <>
                  <p className="text-xs font-semibold">{date.getDate()}</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {todays.slice(0, 2).map((it) => (
                      <li key={it.key} title={`${it.title} · ${it.detail}`} className="truncate rounded bg-bark px-1 text-[10px] leading-4 text-paper">
                        {it.title}
                      </li>
                    ))}
                    {todays.length > 2 && <li className="text-[10px]">+{todays.length - 2} more</li>}
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

function PlanEventDialog({ onClose }: { onClose: () => void }) {
  const { addEvent } = useStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<Omit<PlannedEvent, "id">>({
    title: "",
    date: "2026-10-24",
    slot: "afternoon",
    location: "",
  });

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    addEvent({ ...form, title: form.title.trim(), location: form.location.trim() });
    onClose();
  }

  const input = "mt-1 w-full rounded-lg border-2 border-bark/30 bg-paper px-3 py-2 font-normal";
  return (
    <dialog ref={dialog} onClose={onClose} className="m-auto w-[min(92vw,420px)] rounded-[22px] bg-ember p-3 backdrop:bg-bark/50">
      <form onSubmit={submit} className="space-y-3 rounded-[16px] bg-card p-5 text-bark">
        <h2 className="text-xl font-bold">Plan an event</h2>
        <label className="block text-sm font-medium">
          What
          <input required maxLength={60} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Study session + bubble tea" className={input} />
        </label>
        <label className="block text-sm font-medium">
          Date
          <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={input} />
        </label>
        <label className="block text-sm font-medium">
          Time of day
          <select value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value as Slot })} className={`${input} capitalize`}>
            {SLOTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Where
          <input required maxLength={80} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Library, Group Room 2" className={input} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 font-medium hover:bg-paper">
            Cancel
          </button>
          <DarkButton type="submit">Add to calendar</DarkButton>
        </div>
      </form>
    </dialog>
  );
}

export default function EventsPage() {
  const { me, plannedEvents } = useStore();
  const matches = useMatches();
  const [showFriends, setShowFriends] = useState(false);
  const [friendId, setFriendId] = useState<number | null>(null);
  const [planning, setPlanning] = useState(false);

  const items = useMemo<CalendarItem[]>(
    () =>
      [
        ...events.map((e) => ({ key: `e${e.id}`, title: e.title, date: parseEventDate(e.date), detail: `${e.slot} · ${e.location}` })),
        ...plannedEvents.map((p) => ({ key: p.id, title: p.title, date: fromInput(p.date), detail: `${p.slot} · ${p.location}` })),
      ].sort((a, b) => +a.date - +b.date),
    [plannedEvents],
  );

  const friend = matches.find((m) => m.student.id === (friendId ?? matches[0]?.student.id))?.student;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      <PageTitle>Events</PageTitle>

      <div className="space-y-5">
        <Calendar items={items} />
        <section className="rounded-[22px] bg-bark p-6 text-paper" aria-labelledby="upcoming-title">
          <h2 id="upcoming-title" className="text-3xl tracking-wide">
            Upcoming Events!
          </h2>
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-2 text-lg">
            {items.map((it) => (
              <li key={it.key}>
                <b>{formatDate(it.date)}:</b> {it.title}
                <span className="block text-sm opacity-70 first-letter:uppercase">{it.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="space-y-4">
        <section className="rounded-[22px] bg-ember p-5 text-paper" aria-labelledby="timetable-title">
          <h2 id="timetable-title" className="border-b border-paper/70 pb-2 text-3xl tracking-wide">
            Your timetable
          </h2>
          <p className="mt-2 text-xl font-semibold">Courses: {me.courses.join(", ")}</p>
          <div className="mt-3">
            <Timetable mine={me} dark />
          </div>
        </section>

        <button
          onClick={() => setShowFriends(!showFriends)}
          aria-expanded={showFriends}
          className="w-full rounded-[22px] bg-ember px-6 py-6 text-3xl font-semibold tracking-wide text-paper hover:brightness-110"
        >
          View friends&apos; timetables
        </button>

        {showFriends && friend && (
          <section className="rounded-[22px] bg-paper p-5" aria-label="Friend's timetable">
            <label className="text-sm font-medium">
              Compare with
              <select
                value={friend.id}
                onChange={(e) => setFriendId(Number(e.target.value))}
                className="ml-2 rounded-lg border-2 border-bark/30 bg-white/60 px-2 py-1"
              >
                {matches.map((m) => (
                  <option key={m.student.id} value={m.student.id}>
                    {m.student.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-xs">Green = you are both free.</p>
            <div className="mt-2 rounded-xl bg-bark/90 p-2">
              <Timetable mine={me} other={friend} dark />
            </div>
          </section>
        )}

        <button
          onClick={() => setPlanning(true)}
          className="w-full rounded-[18px] bg-ember px-6 py-3 text-left text-2xl font-semibold tracking-wider text-paper hover:brightness-110"
        >
          PLAN AN EVENT!
        </button>
      </div>

      {planning && <PlanEventDialog onClose={() => setPlanning(false)} />}
    </div>
  );
}
