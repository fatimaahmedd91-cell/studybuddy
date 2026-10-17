"use client";

// Study groups: one card per group with a JOIN! button.
import { DarkButton, OrangeCard, PageTitle } from "@/components/ui";
import { studyGroups } from "@/lib/data";
import { useStore } from "@/lib/store";

export default function GroupsPage() {
  const { me, joinedGroups, toggleGroup } = useStore();

  // Your own courses first, then the rest.
  const groups = [...studyGroups].sort(
    (a, b) => Number(me.courses.includes(b.course)) - Number(me.courses.includes(a.course)),
  );

  return (
    <div className="space-y-5">
      <PageTitle>Study groups</PageTitle>
      {groups.map((group) => {
        const joined = joinedGroups.includes(group.id);
        const left = group.seats - group.taken - (joined ? 1 : 0);
        const full = left <= 0 && !joined;
        return (
          <OrangeCard key={group.id}>
            <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <div>
                <h2 className="text-2xl tracking-wide sm:text-3xl">
                  {group.course} – Study Group
                  {me.courses.includes(group.course) && (
                    <span className="ml-3 rounded-full bg-paper px-2.5 py-0.5 align-middle text-xs font-semibold">
                      your course
                    </span>
                  )}
                </h2>
                <p className="mt-1 text-lg sm:text-xl">
                  {group.day} {group.time} – {group.location} –{" "}
                  <b>{left > 0 ? `${left} seat${left === 1 ? "" : "s"} remaining` : "no seats remaining"}</b>
                </p>
              </div>
              <DarkButton
                onClick={() => toggleGroup(group.id)}
                disabled={full}
                aria-pressed={joined}
                className="min-w-40 py-4 text-2xl sm:text-3xl"
              >
                {joined ? "JOINED ✓" : full ? "FULL" : "JOIN!"}
              </DarkButton>
            </div>
          </OrangeCard>
        );
      })}
    </div>
  );
}
