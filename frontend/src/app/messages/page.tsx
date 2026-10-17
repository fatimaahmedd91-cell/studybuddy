"use client";

// Messages: the current chat on the left, your contacts with a search box on the right.
import { useEffect, useRef, useState } from "react";
import { SearchIcon, SendIcon } from "@/components/Icons";
import { Avatar, PageTitle } from "@/components/ui";
import { getStudent, handle } from "@/lib/data";
import { useMatches, useStore } from "@/lib/store";

export default function MessagesPage() {
  const { me, chatWith, sendMessage, activeChat, setActiveChat } = useStore();
  const matches = useMatches();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const friend = activeChat ? getStudent(activeChat) : null;
  const messages = friend ? chatWith(friend.id) : [];
  const contacts = matches
    .map((m) => m.student)
    .filter((s) => `${s.name} ${handle(s.name)}`.toLowerCase().includes(search.toLowerCase()));

  // Keep the newest message in view.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, activeChat]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!friend || !draft.trim()) return;
    sendMessage(friend.id, draft.trim());
    setDraft("");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <PageTitle>Messages</PageTitle>

      {/* Current chat */}
      <div className="rounded-[22px] bg-ember p-3 sm:p-4">
        <div className="flex h-[min(70vh,640px)] flex-col rounded-[16px] bg-bark p-4 text-paper sm:p-6">
          {friend ? (
            <>
              <div className="flex items-center gap-3 border-b border-paper/20 pb-3">
                <Avatar student={friend} size="sm" />
                <div>
                  <p className="font-semibold">{friend.name}</p>
                  <p className="text-xs opacity-70">@{handle(friend.name)}</p>
                </div>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto py-4" aria-live="polite">
                {messages.map((m, i) =>
                  m.from === "them" ? (
                    <div key={i} className="flex items-end gap-2">
                      <span className="h-5 w-5 shrink-0 rounded-full border-2 border-paper" aria-hidden="true" />
                      <p className="max-w-[75%] rounded-2xl bg-paper px-4 py-2 text-sm text-bark">{m.text}</p>
                    </div>
                  ) : (
                    <div key={i} className="flex justify-end">
                      <p className="max-w-[75%] rounded-2xl bg-card px-4 py-2 text-sm text-bark">{m.text}</p>
                    </div>
                  ),
                )}
                <div ref={bottom} />
              </div>
              <form onSubmit={send} className="flex gap-2">
                <label htmlFor="message" className="sr-only">
                  Message {friend.name}
                </label>
                <input
                  id="message"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={500}
                  placeholder={`Message ${friend.name.split(" ")[0]}…`}
                  className="flex-1 rounded-full bg-paper px-4 py-2 text-sm text-bark"
                />
                <button
                  type="submit"
                  aria-label="Send"
                  className="rounded-full border-2 border-paper p-2 hover:bg-paper hover:text-bark"
                >
                  <SendIcon className="h-5 w-5" />
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div className="flex h-36 w-36 items-center justify-center rounded-full border-2 border-paper">
                <SendIcon className="h-16 w-16" />
              </div>
              <p className="mt-6 text-3xl tracking-wide">Current Chat</p>
              <p className="mt-2 text-sm opacity-70">Pick someone on the right to start chatting, {me.name.split(" ")[0]}.</p>
            </div>
          )}
        </div>
      </div>

      {/* Contacts */}
      <div className="rounded-[22px] bg-ember p-3 sm:p-4">
        <div className="flex h-full max-h-[min(70vh,640px)] flex-col rounded-[16px] bg-card p-4">
          <label className="flex items-center gap-2 rounded-full border-2 border-bark px-4 py-2">
            <SearchIcon className="h-4 w-4" />
            <span className="sr-only">Search people</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <ul className="mt-3 flex-1 space-y-1 overflow-y-auto">
            {contacts.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => setActiveChat(s.id)}
                  aria-current={activeChat === s.id ? "true" : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left ${
                    activeChat === s.id ? "bg-paper" : "hover:bg-paper/60"
                  }`}
                >
                  <Avatar student={s} size="sm" />
                  <span className="text-sm">{handle(s.name)}</span>
                </button>
              </li>
            ))}
            {contacts.length === 0 && <li className="px-2 py-4 text-sm opacity-70">Nobody matches that search.</li>}
          </ul>
          <p className="mt-2 text-[11px] opacity-60">Demo chat: messages are saved in this browser only.</p>
        </div>
      </div>
    </div>
  );
}
