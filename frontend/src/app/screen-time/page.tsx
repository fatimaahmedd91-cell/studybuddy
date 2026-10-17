"use client";

// Screen time: today's total for you and your closest friends, plus last week's winner
// (the person with the LEAST screen time) and past winners.
import { useMemo, useState } from "react";
import { CrownIcon } from "@/components/Icons";
import { Avatar, PageTitle } from "@/components/ui";
import { PAST_WINNERS, getStudent, handle, screenHoursLastWeek, screenMinutesToday } from "@/lib/data";
import { useMatches, useStore } from "@/lib/store";

// One colour per person, checked for colour-blind safety against the dark brown panel.
// A person keeps their colour no matter where they rank.
const SERIES = ["#e05a10", "#1f9fc4", "#a8860a", "#d25b8c"];
const PANEL = "#401800";

function formatMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h ${m}min` : `${m}min`;
}

type Slice = { id: number; label: string; minutes: number; color: string };

// Draws the pie as SVG wedges. A 2px gap (in the panel colour) separates the wedges.
function Pie({ slices }: { slices: Slice[] }) {
  const [active, setActive] = useState<number | null>(null);
  const total = slices.reduce((sum, s) => sum + s.minutes, 0);
  const R = 90;
  const C = 100;

  let angle = -Math.PI / 2; // start at 12 o'clock
  const wedges = slices.map((slice) => {
    const sweep = (slice.minutes / total) * Math.PI * 2;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    const mid = (start + end) / 2;
    const point = (a: number) => `${C + R * Math.cos(a)} ${C + R * Math.sin(a)}`;
    const large = sweep > Math.PI ? 1 : 0;
    return {
      ...slice,
      path: `M ${C} ${C} L ${point(start)} A ${R} ${R} 0 ${large} 1 ${point(end)} Z`,
      share: Math.round((slice.minutes / total) * 100),
      tip: { x: C + R * 0.6 * Math.cos(mid), y: C + R * 0.6 * Math.sin(mid) },
    };
  });
  const shown = wedges.find((w) => w.id === active);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[300px]">
      <svg viewBox="0 0 200 200" className="h-full w-full" role="img" aria-label="Share of today's screen time by person">
        {wedges.map((w) => (
          <path
            key={w.id}
            d={w.path}
            fill={w.color}
            stroke={PANEL}
            strokeWidth={2}
            strokeLinejoin="round"
            tabIndex={0}
            aria-label={`${w.label}: ${formatMinutes(w.minutes)}, ${w.share}%`}
            onMouseEnter={() => setActive(w.id)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(w.id)}
            onBlur={() => setActive(null)}
            className="cursor-pointer outline-none transition-opacity"
            style={{ opacity: active === null || active === w.id ? 1 : 0.55 }}
          />
        ))}
      </svg>
      {shown && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-paper px-3 py-1.5 text-xs text-bark shadow-lg"
          style={{ left: `${shown.tip.x / 2}%`, top: `${shown.tip.y / 2}%` }}
        >
          <b>{shown.label}</b>
          <br />
          {formatMinutes(shown.minutes)} · {shown.share}%
        </div>
      )}
    </div>
  );
}

export default function ScreenTimePage() {
  const { me } = useStore();
  const matches = useMatches();

  // You plus your three best matches, each with a fixed colour.
  const circle = useMemo(() => [me, ...matches.slice(0, 3).map((m) => m.student)], [me, matches]);
  const slices: Slice[] = circle.map((s, i) => ({
    id: s.id,
    label: s.id === me.id ? `${handle(s.name)} (you)` : handle(s.name),
    minutes: screenMinutesToday(s.id),
    color: SERIES[i],
  }));
  const ranked = [...slices].sort((a, b) => b.minutes - a.minutes);

  const winner = [...circle].sort((a, b) => screenHoursLastWeek(a.id) - screenHoursLastWeek(b.id))[0];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <PageTitle>Screen time</PageTitle>

      <section className="rounded-[22px] bg-bark p-6 text-paper sm:p-8" aria-labelledby="total-title">
        <h2 id="total-title" className="text-3xl tracking-wide sm:text-4xl">
          Total Screen Time
        </h2>
        <p className="mt-1 text-sm opacity-75">Today, you and your closest friends</p>
        <div className="mt-6">
          <Pie slices={slices} />
        </div>
        <ol className="mt-6 space-y-2">
          {ranked.map((s, i) => (
            <li key={s.id} className="flex items-center justify-between gap-3 text-lg">
              <span className="flex items-center gap-3">
                <span className="w-5 text-right opacity-75">{i + 1}.</span>
                <span className="h-3.5 w-3.5 shrink-0 rounded-[4px]" style={{ background: s.color }} aria-hidden="true" />
                {s.label}
              </span>
              <span className="tabular-nums">{formatMinutes(s.minutes)}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="space-y-5">
        <section className="flex flex-col items-center gap-6 rounded-[22px] bg-ember p-6 text-paper sm:flex-row sm:p-8">
          <div className="flex flex-col items-center">
            <CrownIcon className="-mb-3 h-14 w-14 text-bark" />
            <Avatar student={winner} size="lg" />
            <p className="mt-2 text-xl font-semibold">@{handle(winner.name)}</p>
          </div>
          <div className="text-center sm:text-left">
            <h2 className="border-b border-paper/70 pb-2 text-3xl font-semibold uppercase tracking-wider">
              Last week&apos;s winner
            </h2>
            <p className="mt-3">
              <span className="text-7xl font-bold tabular-nums">{screenHoursLastWeek(winner.id)}</span>
              <span className="ml-2 text-3xl font-semibold">hours</span>
            </p>
            <p className="mt-2 text-xl font-semibold">Least screen time in your circle</p>
          </div>
        </section>

        <section className="rounded-[22px] bg-bark p-6 text-paper sm:p-8" aria-labelledby="past-title">
          <h2 id="past-title" className="border-b border-paper/50 pb-2 text-3xl tracking-wide">
            Past Winners
          </h2>
          <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-2">
            {PAST_WINNERS.map((w) => (
              <li key={w.week} className="flex justify-between gap-4">
                <span>
                  {w.week}: <span className="underline underline-offset-4">{handle(getStudent(w.studentId).name)}</span>
                </span>
                <span className="tabular-nums opacity-80">{w.hours} hours</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
