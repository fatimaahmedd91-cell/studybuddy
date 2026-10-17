"use client";

// Friends: a grid of people ranked by how well you match. Click one to see why.
import { useRouter } from "next/navigation";
import { useState } from "react";
import InsightPanel from "@/components/InsightPanel";
import Timetable from "@/components/Timetable";
import { Avatar, DarkButton, OrangeCard, PageTitle, ProfileLines } from "@/components/ui";
import { handle, students } from "@/lib/data";
import { type Match, friendsOf } from "@/lib/matching";
import { useMatches, useStore } from "@/lib/store";

function MatchBadge({ score }: { score: number }) {
  return <span className="rounded-full bg-bark px-3 py-1 text-sm font-semibold text-paper">{score}% match</span>;
}

function FriendDetail({ match, onBack }: { match: Match; onBack: () => void }) {
  const { me, postsBy, setActiveChat } = useStore();
  const router = useRouter();
  const s = match.student;

  function message() {
    setActiveChat(s.id);
    router.push("/messages");
  }

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="rounded-full bg-paper px-4 py-1.5 font-medium hover:bg-card">
        ← Back to friends
      </button>
      <OrangeCard>
        <div className="space-y-5 p-5 sm:p-7">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
            <Avatar student={s} size="lg" />
            <div className="flex-1 text-center sm:text-left">
              <ProfileLines student={s} handle={handle(s.name)} posts={postsBy(s.id).length} friends={friendsOf(s, students).length} />
              <p className="mt-2 italic">&ldquo;{s.hook}&rdquo;</p>
              <p className="mt-1 text-sm">Looking for: {s.lookingFor}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                {s.interests.map((i) => (
                  <span
                    key={i}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      match.sharedInterests.includes(i) ? "bg-bark text-paper" : "bg-paper"
                    }`}
                  >
                    {i}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-center gap-3">
              <p className="text-5xl font-bold">{match.score}%</p>
              <p className="-mt-2 text-sm">match</p>
              <DarkButton onClick={message}>Message</DarkButton>
            </div>
          </div>
          <InsightPanel match={match} />
          <div>
            <h2 className="mb-2 font-semibold">Your shared free time</h2>
            <div className="rounded-xl bg-bark p-2">
              <Timetable mine={me} other={s} dark />
            </div>
          </div>
          <p className="text-xs opacity-70">
            Score: up to 40 points for shared interests, 35 for shared courses, and 25 for shared free time.
          </p>
        </div>
      </OrangeCard>
    </div>
  );
}

export default function FriendsPage() {
  const { postsBy } = useStore();
  const matches = useMatches();
  const [selected, setSelected] = useState<number | null>(null);

  const chosen = matches.find((m) => m.student.id === selected);
  if (chosen) return <FriendDetail match={chosen} onBack={() => setSelected(null)} />;

  return (
    <div>
      <PageTitle>Friends</PageTitle>
      <p className="mb-4 text-sm">Ranked by shared interests, courses, and free time. Click someone to see why you match.</p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {matches.map((m) => (
          <button key={m.student.id} onClick={() => setSelected(m.student.id)} className="text-left transition hover:-translate-y-0.5">
            <OrangeCard className="h-full">
              <div className="flex flex-col items-center gap-2 p-5">
                <Avatar student={m.student} size="md" />
                <ProfileLines
                  student={m.student}
                  handle={handle(m.student.name)}
                  posts={postsBy(m.student.id).length}
                  friends={friendsOf(m.student, students).length}
                  centered
                />
                <MatchBadge score={m.score} />
              </div>
            </OrangeCard>
          </button>
        ))}
      </div>
    </div>
  );
}
