"use client";

// Screen Time, in two tabs:
//   My time: time in Meerkat (measured, only this app), your daily goal, and your
//            self-reported phone screen time (typed in by you).
//   Groups:  screen-time accountability groups with a shared per-person target and a leaderboard
//            (components/ScreenTimeGroups.tsx).
// How in-app time is counted: backend/app/screen_time.py. Groups and self-reported entries:
// backend/app/screen_time_groups.py.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { GroupDetail, GroupsList } from "@/components/ScreenTimeGroups";
import { ErrorBox, Loading, Notice } from "@/components/States";
import { Button, DarkPanel, Field, FrameCard, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth, useMe } from "@/lib/auth";
import { type Entry, dayLabel, isoDay, minutesLabel, screenTimeApi } from "@/lib/screenTime";
import { formatMinutes, myTimeZone } from "@/lib/time";
import type { ScreenTime } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const BAR = "var(--color-sage-strong)"; // light bars, checked for contrast against the dark panel
const W = 340;
const H = 190;
const PAD = { top: 22, bottom: 26, left: 8, right: 8 };

function WeekChart({ data }: { data: ScreenTime }) {
  const [active, setActive] = useState<number | null>(null);
  const minutes = data.week.map((d) => Math.round(d.seconds / 60));
  const goal = data.goal_minutes ?? 0;
  const max = Math.max(5, goal, ...minutes);
  const slot = (W - PAD.left - PAD.right) / 7;
  const barW = Math.min(24, slot * 0.55);
  const y = (m: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - m / max);
  const dayName = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });

  if (minutes.every((m) => m === 0)) {
    return (
      <p className="rounded-xl border-2 border-dashed border-cream/40 px-4 py-8 text-center text-sm">
        No time recorded this week yet. Time is added every 30 seconds while you use Meerkat.
      </p>
    );
  }

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Minutes in Meerkat for each of the last 7 days">
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--color-cream)" strokeOpacity={0.4} />
        {goal > 0 && (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(goal)} y2={y(goal)} stroke="var(--color-cream)" strokeDasharray="4 4" />
            <text x={W - PAD.right} y={y(goal) - 4} textAnchor="end" fontSize="10" fill="var(--color-cream)">goal {goal} min</text>
          </g>
        )}
        {data.week.map((day, i) => {
          const x = PAD.left + slot * i + (slot - barW) / 2;
          const top = y(minutes[i]);
          const height = Math.max(0, y(0) - top);
          const isToday = i === 6;
          return (
            <g key={day.date} tabIndex={0} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)} onBlur={() => setActive(null)} aria-label={`${dayName(day.date)}: ${minutes[i]} minutes`}
              className="outline-none">
              <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={H - PAD.top - PAD.bottom} fill="transparent" />
              {height > 0 && (
                <path
                  d={`M${x},${y(0)} V${top + Math.min(4, height)} q0,-4 4,-4 h${barW - 8} q4,0 4,4 V${y(0)} Z`}
                  fill={BAR}
                  opacity={active === null || active === i ? 1 : 0.6}
                />
              )}
              <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--color-cream)" fontWeight={isToday ? 700 : 400}>
                {isToday ? "Today" : dayName(day.date)}
              </text>
              {(active === i || (active === null && isToday)) && (
                <text x={x + barW / 2} y={top - 6} textAnchor="middle" fontSize="11" fontWeight={700} fill="var(--color-cream)">
                  {minutes[i]} min
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>Minutes per day</caption>
        <tbody>
          {data.week.map((d, i) => (
            <tr key={d.date}><th>{d.date}</th><td>{minutes[i]} minutes</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function GoalCard({ data, onSaved }: { data: ScreenTime; onSaved: () => void }) {
  const me = useMe();
  const { setMe } = useAuth();
  const [value, setValue] = useState(me.daily_goal_minutes ? String(me.daily_goal_minutes) : "");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const goal = data.goal_minutes;
  const today = Math.round(data.today_seconds / 60);

  async function save(minutes: number | null) {
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 5 || minutes > 600)) {
      setMessage({ kind: "error", text: "Pick a goal from 5 to 600 minutes." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      setMe(await api.updateMe({ daily_goal_minutes: minutes }));
      setMessage({ kind: "success", text: minutes ? "Goal saved." : "Goal cleared." });
      if (minutes === null) setValue("");
      onSaved();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Couldn't save the goal." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="goal-title" className="rounded-frame bg-forest p-5 text-cream sm:p-6">
      <h2 id="goal-title" className="text-2xl font-bold uppercase tracking-wider">Daily goal in Meerkat</h2>
      {goal ? (
        <>
          <p className="mt-2 text-xl font-bold">{today} of {goal} min today</p>
          <div className="mt-2 h-4 overflow-hidden rounded-full bg-cream" role="progressbar" aria-valuemin={0}
            aria-valuemax={goal} aria-valuenow={Math.min(today, goal)} aria-label="Progress toward your daily goal">
            <div className="h-full rounded-full bg-pine" style={{ width: `${Math.min(100, (today / goal) * 100)}%` }} />
          </div>
          <p className="mt-2 text-xl font-bold">{today > goal ? "Over your goal. Maybe time for a real-life hangout?" : "Within your goal."}</p>
        </>
      ) : (
        <p className="mt-2 text-xl font-bold">Set a limit for how long you want to spend here each day.</p>
      )}
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); save(Number(value)); }}>
        <label className="text-lg font-bold">
          Minutes per day
          <input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} className={`${inputClass} mt-1 w-32 text-base`} />
        </label>
        <Button type="submit" variant="dark" disabled={busy}>Save goal</Button>
        {goal && <Button type="button" variant="light" disabled={busy} onClick={() => save(null)}>Clear</Button>}
      </form>
      {message && <div className="mt-3"><Notice kind={message.kind}>{message.text}</Notice></div>}
    </section>
  );
}

// Phone/device screen time that YOU type in. Meerkat can't read it from your device.
function SelfReportCard() {
  const me = useMe();
  const tz = me.timezone || myTimeZone();
  const yesterday = isoDay(tz, -1);
  const { data, error, loading, reload } = useApi(() => screenTimeApi.entries(14), []);
  const [day, setDay] = useState(yesterday);
  const [hours, setHours] = useState("");
  const [mins, setMins] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const windowDays = data?.window_days ?? 14;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const total = Number(hours || 0) * 60 + Number(mins || 0);
    if (!day) return setMessage({ kind: "error", text: "Pick a day." });
    if (!Number.isInteger(total) || total < 0 || total > 1440 || Number(mins || 0) > 59) {
      return setMessage({ kind: "error", text: "Enter hours (0–24) and minutes (0–59), up to 24 hours in total." });
    }
    setBusy(true);
    setMessage(null);
    try {
      const saved = await screenTimeApi.saveEntry(day, total);
      setMessage({ kind: "success", text: `Saved ${minutesLabel(saved.minutes)} for ${dayLabel(day)}.` });
      reload();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "That wasn't saved." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry: Entry) {
    setMessage(null);
    try {
      await screenTimeApi.deleteEntry(entry.day);
      setMessage({ kind: "success", text: `Removed the entry for ${dayLabel(entry.day)}.` });
      reload();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "That wasn't removed." });
    }
  }

  function edit(entry: Entry) {
    setDay(entry.day);
    setHours(String(Math.floor(entry.minutes / 60)));
    setMins(String(entry.minutes % 60));
    setMessage(null);
  }

  return (
    <FrameCard>
      <section aria-labelledby="self-report-title" className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="self-report-title" className="text-2xl font-bold">Your phone screen time</h2>
          <span className="rounded-full bg-pine px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-cream">Self-reported</span>
        </div>
        <p className="text-sm">
          Meerkat can&apos;t read your phone&apos;s screen time from a website. Copy the daily total from Screen Time
          (iPhone) or Digital Wellbeing (Android) and log it here. You can log the last {windowDays} days.
        </p>
        <form onSubmit={save} className="space-y-3">
          <Field label="Day" htmlFor="st-day">
            <input id="st-day" type="date" value={day} min={isoDay(tz, -(windowDays - 1))} max={isoDay(tz, 0)}
              onChange={(e) => setDay(e.target.value)} className={inputClass} />
          </Field>
          <fieldset className="flex flex-wrap gap-3">
            <legend className="mb-1 text-sm font-semibold">Screen time that day</legend>
            <label className="w-28 text-sm">
              Hours
              <input inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))}
                className={`${inputClass} mt-1`} aria-describedby="st-hint" />
            </label>
            <label className="w-28 text-sm">
              Minutes
              <input inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ""))}
                className={`${inputClass} mt-1`} aria-describedby="st-hint" />
            </label>
          </fieldset>
          <p id="st-hint" className="text-xs">Saving the same day again replaces what you logged before.</p>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </form>
        {message && <Notice kind={message.kind}>{message.text}</Notice>}
        <div>
          <h3 className="text-lg font-bold">Recent entries</h3>
          {loading && <Loading />}
          {error && <ErrorBox message={error} onRetry={reload} />}
          {data && data.entries.length === 0 && <p className="text-sm">Nothing logged in the last {windowDays} days.</p>}
          <ul className="mt-1 divide-y divide-pine/15">
            {data?.entries.map((entry) => (
              <li key={entry.day} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><b>{dayLabel(entry.day)}</b> · {minutesLabel(entry.minutes)}</span>
                <span className="flex gap-2">
                  <Button variant="outline" className="min-h-9 px-3 text-sm" onClick={() => edit(entry)}
                    aria-label={`Edit ${dayLabel(entry.day)}`}>Edit</Button>
                  <Button variant="danger" className="min-h-9 px-3 text-sm" onClick={() => remove(entry)}
                    aria-label={`Delete ${dayLabel(entry.day)}`}>Delete</Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </FrameCard>
  );
}

function MyTime() {
  const tz = myTimeZone();
  const { data, error, loading, reload } = useApi(() => api.screenTime(tz), [tz], 60_000);

  return (
    <>
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <DarkPanel>
              <h2 className="text-3xl tracking-wide">Time in Meerkat</h2>
              <p className="mt-1 text-sm opacity-80">Measured · only this app · today, in {tz}</p>
              <p className="mt-3 text-6xl font-bold tabular-nums">{formatMinutes(data.today_seconds)}</p>
              <div className="mt-5">
                <WeekChart data={data} />
              </div>
            </DarkPanel>
            <GoalCard data={data} onSaved={reload} />
          </div>
          <div className="space-y-5">
            <SelfReportCard />
            <DarkPanel>
              <h2 className="text-2xl font-bold">What the numbers mean</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                <li>
                  <b>Time in Meerkat</b> is measured, but only for this app: in 30-second steps while a Meerkat tab is
                  open, visible, and used in the last minute. Hidden or idle tabs don&apos;t count, and two open tabs
                  aren&apos;t counted twice. It is not your total phone use.
                </li>
                <li>
                  <b>Self-reported</b> phone screen time is what you type in. Meerkat doesn&apos;t check it.
                </li>
                <li>
                  Meerkat can&apos;t measure screen time across your whole device. No such integration is available on
                  the web.
                </li>
                <li>
                  Only you see your numbers, unless you join a screen-time group. A group only sees the kind of number
                  it uses, for its members.
                </li>
              </ul>
              <p className="mt-3 text-xs opacity-80">
                In-app time is stored in {data.storage === "timescaledb" ? "a TimescaleDB hypertable (TigerData)" : "PostgreSQL"}.
              </p>
            </DarkPanel>
          </div>
        </div>
      )}
    </>
  );
}

function ScreenTimeContent() {
  const params = useSearchParams();
  const groupId = params.get("group");
  const tab = groupId || params.get("tab") === "groups" ? "groups" : "mine";
  const tabClass = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-xl px-4 font-semibold ${active ? "bg-pine text-cream" : "text-pine hover:bg-sage"}`;

  return (
    <div>
      <h1 className="mb-4 text-3xl font-bold sm:text-4xl">Screen Time</h1>
      <nav aria-label="Screen time sections" className="mb-5 inline-flex gap-1 rounded-2xl border-2 border-pine bg-cream p-1">
        <Link href="/screen-time" aria-current={tab === "mine" ? "page" : undefined} className={tabClass(tab === "mine")}>
          My time
        </Link>
        <Link href="/screen-time?tab=groups" aria-current={tab === "groups" ? "page" : undefined} className={tabClass(tab === "groups")}>
          Groups
        </Link>
      </nav>
      {tab === "mine" ? <MyTime /> : groupId ? <GroupDetail id={Number(groupId)} /> : <GroupsList />}
    </div>
  );
}

export default function ScreenTimePage() {
  return (
    <Suspense fallback={<Loading />}>
      <ScreenTimeContent />
    </Suspense>
  );
}
