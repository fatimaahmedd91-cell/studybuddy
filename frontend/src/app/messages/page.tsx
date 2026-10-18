"use client";

// Messages with friends: the current chat on the left, your conversations on the right.
// New messages are fetched every few seconds (polling), so they appear within a few seconds.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import { SearchIcon, SendIcon } from "@/components/Icons";
import { BlockButton, ReportDialog } from "@/components/SafetyActions";
import { Empty, ErrorBox, Loading } from "@/components/States";
import { DemoBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { formatTime, timeAgo } from "@/lib/time";
import { useApi } from "@/lib/useApi";

function Chat({ friendId, onSent }: { friendId: number; onSent: () => void }) {
  const { data, error, loading, reload, setData } = useApi(() => api.messages(friendId), [friendId], 4000);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [reporting, setReporting] = useState<number | null>(null);
  const router = useRouter();
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [data?.messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setSendError(null);
    try {
      const message = await api.sendMessage(friendId, body);
      // Shown only after the server saved it.
      if (data) setData({ ...data, messages: [...data.messages, message] });
      setDraft("");
      onSent();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Your message wasn't sent.");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <div className="p-6 text-cream"><Loading label="Loading messages…" /></div>;
  if (error || !data) return <div className="p-4"><ErrorBox message={error ?? "Couldn't load this chat."} onRetry={reload} /></div>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-cream/25 pb-3">
        <Link href="/messages" className="rounded-lg px-2 py-1 text-cream underline lg:hidden">← Back</Link>
        <Avatar person={data.friend} size="sm" />
        <Link href={`/profile?id=${data.friend.id}`} className="font-semibold text-cream underline-offset-4 hover:underline">
          {data.friend.name}
        </Link>
        {data.friend.is_demo && <DemoBadge />}
        <span className="ml-auto">
          <BlockButton userId={data.friend.id} name={data.friend.name} onBlocked={() => router.push("/friends")} />
        </span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto py-4" aria-live="polite" aria-label={`Messages with ${data.friend.name}`}>
        {data.messages.length === 0 && <p className="text-center text-sm text-cream/80">No messages yet. Say hi!</p>}
        {data.messages.map((m) => (
          <div key={m.id} className={`flex ${m.from_me ? "justify-end" : "items-end gap-2"}`}>
            {!m.from_me && <span className="h-5 w-5 shrink-0 rounded-full border-2 border-cream" aria-hidden="true" />}
            <div className={`max-w-[78%] rounded-2xl px-4 py-2 text-bark ${m.from_me ? "bg-sky" : "bg-cream"}`}>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className="mt-0.5 text-right text-[11px] opacity-70">
                {m.from_me ? "You" : data.friend.name.split(" ")[0]} · {formatTime(m.created_at)}
                {!m.from_me && (
                  <button type="button" onClick={() => setReporting(m.id)} className="ml-2 underline">Report</button>
                )}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {sendError && <p role="alert" className="mb-2 rounded-lg bg-cream px-3 py-2 text-sm font-medium text-danger">{sendError}</p>}
      {reporting !== null && <ReportDialog targetType="message" targetId={reporting} onClose={() => setReporting(null)} />}
      <form onSubmit={send} className="flex gap-2">
        <label htmlFor="message" className="sr-only">Message {data.friend.name}</label>
        <input id="message" value={draft} maxLength={1000} onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${data.friend.name.split(" ")[0]}…`} className="min-h-11 flex-1 rounded-full bg-cream px-4 text-bark" />
        <button type="submit" aria-label="Send" disabled={sending || !draft.trim()}
          className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-cream text-cream hover:bg-cream hover:text-bark disabled:opacity-50">
          <SendIcon className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}

function MessagesContent() {
  const params = useSearchParams();
  const router = useRouter();
  const friendId = params.get("with") ? Number(params.get("with")) : null;
  const conversations = useApi(() => api.conversations(), [], 15_000);
  const [search, setSearch] = useState("");

  const list = (conversations.data ?? []).filter((c) => c.friend.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <h1 className="mb-4 text-3xl font-bold">Messages</h1>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
        <div className={`rounded-frame bg-bark p-2.5 sm:p-3.5 ${friendId ? "" : "hidden lg:block"}`}>
          <div className="flex h-[min(70vh,640px)] flex-col rounded-inner bg-bark p-4 sm:p-6">
            {friendId ? (
              <Chat key={friendId} friendId={friendId} onSent={conversations.reload} />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-center text-cream">
                <div className="flex h-32 w-32 items-center justify-center rounded-full border-2 border-cream">
                  <SendIcon className="h-14 w-14" />
                </div>
                <p className="mt-5 text-3xl tracking-wide">Current Chat</p>
                <p className="mt-2 text-sm opacity-80">Pick a friend to start chatting.</p>
              </div>
            )}
          </div>
        </div>

        <div className={`rounded-frame bg-bark p-2.5 sm:p-3.5 ${friendId ? "hidden lg:block" : ""}`}>
          <div className="flex h-full max-h-[min(70vh,640px)] flex-col rounded-inner bg-sky p-4">
            <label className="flex items-center gap-2 rounded-full border-2 border-bark px-4">
              <SearchIcon className="h-4 w-4" />
              <span className="sr-only">Search friends</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search"
                className="min-h-10 w-full bg-transparent outline-none" />
            </label>
            {conversations.loading && <Loading />}
            {conversations.error && <ErrorBox message={conversations.error} onRetry={conversations.reload} />}
            {conversations.data && conversations.data.length === 0 && (
              <div className="mt-4">
                <Empty title="No friends to message yet">
                  You can message people once they accept your friend request. <Link href="/feed" className="font-semibold underline">Find people</Link>
                </Empty>
              </div>
            )}
            <ul className="mt-3 flex-1 space-y-1 overflow-y-auto">
              {list.map((c) => (
                <li key={c.friend.id}>
                  <button onClick={() => router.push(`/messages?with=${c.friend.id}`)}
                    aria-current={friendId === c.friend.id ? "true" : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left ${friendId === c.friend.id ? "bg-cream" : "hover:bg-cream/60"}`}>
                    <Avatar person={c.friend} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{c.friend.name}</span>
                      <span className="block truncate text-xs opacity-80">
                        {c.last_message ? `${c.last_message.from_me ? "You: " : ""}${c.last_message.body} · ${timeAgo(c.last_message.created_at)}` : "No messages yet"}
                      </span>
                    </span>
                    {c.unread > 0 && (
                      <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-forest px-1.5 text-xs font-bold text-cream"
                        aria-label={`${c.unread} unread`}>
                        {c.unread}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] opacity-70">New messages appear within a few seconds.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <MessagesContent />
    </Suspense>
  );
}
