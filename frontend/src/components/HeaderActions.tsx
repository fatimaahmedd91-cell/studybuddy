"use client";

// The two buttons on the right of the header: + (create something) and the notification bell.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { useApi } from "@/lib/useApi";
import Avatar from "./Avatar";
import { EventForm, GroupForm } from "./CreateForms";
import Dialog from "./Dialog";
import { BellIcon, PlusCircleIcon } from "./Icons";
import { ErrorBox } from "./States";

// Closes a pop-up menu when you click outside it or press Escape.
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

export function CreateMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"group" | "event" | null>(null);
  const ref = useDismiss(open, () => setOpen(false));

  const item = "flex min-h-11 w-full items-center rounded-lg px-3 text-left font-medium hover:bg-sky";
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Create"
        className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-sky"
      >
        <PlusCircleIcon className="h-7 w-7" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-50 w-56 rounded-2xl border-2 border-bark bg-cream p-2 shadow-xl">
          <button role="menuitem" className={item} onClick={() => { setOpen(false); setDialog("group"); }}>
            Create a group
          </button>
          <button role="menuitem" className={item} onClick={() => { setOpen(false); setDialog("event"); }}>
            Create an event
          </button>
          <button role="menuitem" className={item} onClick={() => { setOpen(false); router.push("/profile?edit=1"); }}>
            Edit my profile
          </button>
        </div>
      )}
      {dialog === "group" && (
        <Dialog title="Create a group" onClose={() => setDialog(null)}>
          <GroupForm onCreated={(g) => { setDialog(null); router.push(`/groups?id=${g.id}`); }} />
        </Dialog>
      )}
      {dialog === "event" && (
        <Dialog title="Create an event" onClose={() => setDialog(null)}>
          <EventForm onCreated={(e) => { setDialog(null); router.push(`/events?id=${e.id}`); }} />
        </Dialog>
      )}
    </div>
  );
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  // Checks for new notifications every 20 seconds while the tab is visible.
  const { data, error, reload } = useApi(() => api.notifications(), [], 20_000);
  const unread = data?.unread_count ?? 0;

  async function openItem(id: number, link: string, read: boolean) {
    setOpen(false);
    if (!read) await api.markRead(id).catch(() => undefined);
    reload();
    if (link) router.push(link);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) reload();
        }}
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative flex h-11 w-11 items-center justify-center rounded-full hover:bg-sky"
      >
        <BellIcon className="h-7 w-7" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-forest px-1 text-[11px] font-bold text-cream">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(92vw,360px)] rounded-2xl border-2 border-bark bg-cream p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-bold">Notifications</p>
            {unread > 0 && (
              <button
                className="min-h-9 rounded-lg px-2 text-sm font-semibold underline"
                onClick={async () => {
                  await api.markAllRead().catch(() => undefined);
                  reload();
                }}
              >
                Mark all as read
              </button>
            )}
          </div>
          {error && <ErrorBox message={error} onRetry={reload} />}
          {data && data.items.length === 0 && (
            <p className="py-4 text-sm">Nothing yet. Friend requests, messages, and group or event activity show up here.</p>
          )}
          <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
            {data?.items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => openItem(n.id, n.link, n.read)}
                  className={`flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-sky ${n.read ? "opacity-70" : "bg-sky/60"}`}
                >
                  {n.actor ? <Avatar person={n.actor} size="xs" /> : <span className="h-8 w-8" />}
                  <span className="flex-1 text-sm">
                    <span className={n.read ? "" : "font-semibold"}>{n.text}</span>
                    <span className="block text-xs opacity-70">{timeAgo(n.created_at)}</span>
                  </span>
                  {!n.read && <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-forest" aria-label="unread" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
