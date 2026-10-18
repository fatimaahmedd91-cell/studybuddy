"use client";

// Friends: requests you received, requests you sent, and your friends.
import Link from "next/link";
import Avatar from "@/components/Avatar";
import FriendButton from "@/components/FriendButton";
import { ChatIcon } from "@/components/Icons";
import { Empty, ErrorBox, Loading } from "@/components/States";
import { ButtonLink, DemoBadge, OrangeCard, PageHeading } from "@/components/ui";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import type { FriendEntry } from "@/lib/types";
import { useApi } from "@/lib/useApi";

function RequestRow({ entry, kind, onDone }: { entry: FriendEntry; kind: "incoming" | "outgoing"; onDone: () => void }) {
  const p = entry.person;
  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-card p-3 sm:flex-row sm:items-center">
      <Link href={`/profile?id=${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar person={p} size="sm" />
        <span className="min-w-0">
          <span className="flex items-center gap-2 font-semibold">{p.name} {p.is_demo && <DemoBadge />}</span>
          <span className="block text-sm">
            {p.university} · {kind === "incoming" ? "sent" : "you sent"} {entry.sent_at ? timeAgo(entry.sent_at) : ""}
          </span>
        </span>
      </Link>
      <FriendButton personId={p.id} personName={p.name} relationship={{ status: kind, request_id: entry.request_id }}
        onChange={onDone} />
    </li>
  );
}

export default function FriendsPage() {
  const { data, error, loading, reload } = useApi(() => api.friends(), []);

  return (
    <div className="space-y-8">
      <PageHeading title="Friends">
        <ButtonLink href="/messages" variant="outline"><ChatIcon className="h-5 w-5" /> Messages</ButtonLink>
        <ButtonLink href="/feed">Find more friends</ButtonLink>
      </PageHeading>

      {loading && <Loading label="Loading your friends…" />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <>
          <section aria-labelledby="incoming-title">
            <h2 id="incoming-title" className="mb-3 text-xl font-bold">
              Friend requests for you {data.incoming.length > 0 && `(${data.incoming.length})`}
            </h2>
            {data.incoming.length === 0 ? (
              <p className="text-sm">No new requests.</p>
            ) : (
              <ul className="space-y-2">
                {data.incoming.map((entry) => <RequestRow key={entry.request_id} entry={entry} kind="incoming" onDone={reload} />)}
              </ul>
            )}
          </section>

          {data.outgoing.length > 0 && (
            <section aria-labelledby="outgoing-title">
              <h2 id="outgoing-title" className="mb-3 text-xl font-bold">Requests you sent</h2>
              <ul className="space-y-2">
                {data.outgoing.map((entry) => <RequestRow key={entry.request_id} entry={entry} kind="outgoing" onDone={reload} />)}
              </ul>
            </section>
          )}

          <section aria-labelledby="friends-title">
            <h2 id="friends-title" className="mb-3 text-xl font-bold">Your friends ({data.friends.length})</h2>
            {data.friends.length === 0 ? (
              <Empty title="No friends yet">
                Head to <Link href="/feed" className="font-semibold underline">Discover</Link> and send a few friend requests.
              </Empty>
            ) : (
              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {data.friends.map(({ person: p }) => (
                  <li key={p.id}>
                    <OrangeCard className="h-full">
                      <div className="flex h-full flex-col items-center gap-2 p-5 text-center">
                        <Avatar person={p} size="md" />
                        <p className="flex items-center gap-2 text-lg font-bold">{p.name} {p.is_demo && <DemoBadge />}</p>
                        <p className="text-sm">{[p.pronouns, p.university].filter(Boolean).join(" · ")}</p>
                        {p.hook && <p className="text-sm italic">&ldquo;{p.hook}&rdquo;</p>}
                        <div className="mt-auto flex flex-wrap justify-center gap-2 pt-2">
                          <ButtonLink href={`/messages?with=${p.id}`}>Message</ButtonLink>
                          <ButtonLink href={`/profile?id=${p.id}`} variant="outline">Profile</ButtonLink>
                        </div>
                      </div>
                    </OrangeCard>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
