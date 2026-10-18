"use client";

// Screen Time: how long you've spent in FriendFinder (only this app), with an optional daily goal.
// How time is counted is explained on the page and in backend/app/screen_time.py.
import { useState } from "react";
import { ErrorBox, Loading, Notice } from "@/components/States";
import { Button, DarkPanel, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth, useMe } from "@/lib/auth";
import { formatMinutes, myTimeZone } from "@/lib/time";
import type { ScreenTime } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const BAR = "#e05a10"; // checked for contrast against the dark panel
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
      <p className="rounded-xl border-2 border-dashed border-paper/40 px-4 py-8 text-center text-sm">
        No time recorded this week yet. Time is added every 30 seconds while you use FriendFinder.
      </p>
    );
  }

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Minutes in FriendFinder for each of the last 7 days">
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="#fff6e2" strokeOpacity={0.4} />
        {goal > 0 && (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(goal)} y2={y(goal)} stroke="#fff6e2" strokeDasharray="4 4" />
            <text x={W - PAD.right} y={y(goal) - 4} textAnchor="end" fontSize="10" fill="#fff6e2">goal {goal} min</text>
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
              <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#fff6e2" fontWeight={isToday ? 700 : 400}>
                {isToday ? "Today" : dayName(day.date)}
              </text>
              {(active === i || (active === null && isToday)) && (
                <text x={x + barW / 2} y={top - 6} textAnchor="middle" fontSize="11" fontWeight={700} fill="#fff6e2">
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
    <section aria-labelledby="goal-title" className="rounded-[22px] bg-ember p-5 text-paper sm:p-6">
      <h2 id="goal-title" className="text-3xl font-bold uppercase tracking-wider">Daily goal</h2>
      {goal ? (
        <>
          <p className="mt-2 text-xl font-bold">{today} of {goal} min today</p>
          <div className="mt-2 h-4 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuemin={0}
            aria-valuemax={goal} aria-valuenow={Math.min(today, goal)} aria-label="Progress toward your daily goal">
            <div className="h-full rounded-full bg-bark" style={{ width: `${Math.min(100, (today / goal) * 100)}%` }} />
          </div>
          <p className="mt-2 text-xl font-bold">{today > goal ? "Over your goal. Maybe time for a real-life hangout?" : "Within your goal."}</p>
        </>
      ) : (
        <p className="mt-2 text-xl font-bold">Set a limit for how long you want to spend here each day.</p>
      )}
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); save(Number(value)); }}>
        <label className="text-xl font-bold">
          Minutes per day
          <input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} className={`${inputClass} mt-1 w-32 text-base`} />
        </label>
        <Button type="submit" disabled={busy}>Save goal</Button>
        {goal && <Button type="button" variant="light" disabled={busy} onClick={() => save(null)}>Clear</Button>}
      </form>
      {message && <div className="mt-3"><Notice kind={message.kind}>{message.text}</Notice></div>}
    </section>
  );
}

export default function ScreenTimePage() {
  const tz = myTimeZone();
  const { data, error, loading, reload } = useApi(() => api.screenTime(tz), [tz], 60_000);

  return (
    <div>
      <h1 className="mb-5 text-3xl font-bold sm:text-4xl">Screen Time</h1>
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <DarkPanel>
            <h2 className="text-3xl tracking-wide">Time in FriendFinder</h2>
            <p className="mt-1 text-sm opacity-80">Today, in {tz}</p>
            <p className="mt-3 text-6xl font-bold tabular-nums">{formatMinutes(data.today_seconds)}</p>
            <div className="mt-5">
              <WeekChart data={data} />
            </div>
          </DarkPanel>
          <div className="space-y-5">
            <GoalCard data={data} onSaved={reload} />
            <DarkPanel>
              <h2 className="text-2xl font-bold">What counts</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                <li>Only time in FriendFinder. It can&apos;t see your phone&apos;s screen time or other apps.</li>
                <li>Time counts in 30-second steps while a FriendFinder tab is open, visible, and used in the last minute.</li>
                <li>Hidden or idle tabs don&apos;t count, and two open tabs aren&apos;t counted twice.</li>
                <li>Only you can see your time.</li>
              </ul>
              <p className="mt-3 text-xs opacity-80">
                Stored in {data.storage === "timescaledb" ? "a TimescaleDB hypertable (TigerData)" : "PostgreSQL"}.
              </p>
            </DarkPanel>
          </div>
        </div>
      )}
    </div>
  );
}
