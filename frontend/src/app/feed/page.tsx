"use client";

// Feed: one card per person, with their posts in a row you can scroll sideways.
import { Avatar, OrangeCard, PageTitle, PostTile, ProfileLines } from "@/components/ui";
import { handle, students } from "@/lib/data";
import { friendsOf } from "@/lib/matching";
import { useMatches, useStore } from "@/lib/store";

export default function FeedPage() {
  const { postsBy } = useStore();
  const matches = useMatches();

  return (
    <div className="space-y-6">
      <PageTitle>Feed</PageTitle>
      {matches.map(({ student }) => {
        const posts = postsBy(student.id);
        return (
          <OrangeCard key={student.id}>
            <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:gap-6">
              <div className="flex shrink-0 flex-col items-center md:w-56">
                <Avatar student={student} size="lg" />
                <div className="mt-2">
                  <ProfileLines
                    student={student}
                    handle={handle(student.name)}
                    posts={posts.length}
                    friends={friendsOf(student, students).length}
                    centered
                  />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-2 text-sm opacity-70" aria-hidden="true">
                  → scroll for more
                </p>
                <div
                  className="scroll-row flex gap-4 overflow-x-auto pb-3"
                  tabIndex={0}
                  aria-label={`${student.name}'s posts`}
                >
                  {posts.map((post) => (
                    <PostTile key={post.id} post={post} color={student.color} />
                  ))}
                </div>
              </div>
            </div>
          </OrangeCard>
        );
      })}
    </div>
  );
}
