"use client";

// The frame around every page: dark sidebar on the left, cream bar on top, light blue page.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { events, parseEventDate } from "@/lib/data";
import { useStore } from "@/lib/store";
import {
  BellIcon,
  FeedIcon,
  FriendsIcon,
  GroupsIcon,
  HourglassIcon,
  MenuIcon,
  MessagesIcon,
  PartyIcon,
  PlusCircleIcon,
} from "./Icons";
import { DarkButton } from "./ui";

const NAV = [
  { href: "/feed", label: "feed", Icon: FeedIcon },
  { href: "/messages", label: "messages", Icon: MessagesIcon },
  { href: "/groups", label: "groups", Icon: GroupsIcon },
  { href: "/screen-time", label: "screen time", Icon: HourglassIcon },
  { href: "/events", label: "events", Icon: PartyIcon },
  { href: "/friends", label: "friends", Icon: FriendsIcon },
];

const TITLES: Record<string, string> = {
  "/": "Home",
  "/feed": "Feed",
  "/messages": "Messages",
  "/groups": "Study groups",
  "/screen-time": "Screen time",
  "/events": "Events",
  "/friends": "Friends",
  "/settings": "Settings",
  "/login": "Log in",
  "/signup": "Sign up",
};

// The orange ring marks the page you are on, like in the design.
function NavItem({ href, label, active, children }: { href: string; label: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex h-[66px] w-[66px] flex-col items-center justify-center gap-0.5 rounded-full border-2 text-paper transition ${
        active ? "border-ember" : "border-transparent hover:border-ember/50"
      }`}
    >
      {children}
      <span className="whitespace-nowrap text-[9px] leading-tight">({label})</span>
    </Link>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { me } = useStore();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-y-0 left-0 z-30 flex w-[78px] flex-col items-center bg-bark py-3"
    >
      <Link
        href="/"
        aria-label="Home: your profile"
        className={`flex h-16 w-16 items-center justify-center rounded-full border-4 bg-paper text-3xl ${
          pathname === "/" ? "border-ember" : "border-paper"
        }`}
      >
        <span aria-hidden="true">{me.avatar}</span>
      </Link>
      <div className="mt-6 flex flex-1 flex-col items-center gap-3 overflow-y-auto">
        {NAV.map(({ href, label, Icon }) => (
          <NavItem key={href} href={href} label={label} active={pathname === href}>
            <Icon className="h-6 w-6" />
          </NavItem>
        ))}
      </div>
      <Link
        href="/settings"
        aria-label="Settings"
        aria-current={pathname === "/settings" ? "page" : undefined}
        className={`mt-2 flex h-14 w-14 items-center justify-center rounded-full border-2 text-paper ${
          pathname === "/settings" ? "border-ember" : "border-transparent hover:border-ember/50"
        }`}
      >
        <MenuIcon className="h-7 w-7" />
      </Link>
    </nav>
  );
}

const EMOJIS = ["📸", "📚", "☕", "🎮", "🎨", "🏀", "🎧", "🌇", "🍜", "💻", "🧘", "🎉"];

function CreatePostDialog({ onClose }: { onClose: () => void }) {
  const { addPost } = useStore();
  const router = useRouter();
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [caption, setCaption] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!caption.trim()) return;
    addPost(emoji, caption.trim());
    onClose();
    router.push("/");
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="m-auto w-[min(92vw,440px)] rounded-[22px] bg-ember p-3 backdrop:bg-bark/50"
    >
      <form onSubmit={submit} className="rounded-[16px] bg-card p-5 text-bark">
        <h2 className="text-xl font-bold">Create your own post</h2>
        <p className="mt-3 text-sm font-medium">Pick a picture</p>
        <div className="mt-2 grid grid-cols-6 gap-2">
          {EMOJIS.map((e) => (
            <button
              type="button"
              key={e}
              onClick={() => setEmoji(e)}
              aria-pressed={emoji === e}
              className={`aspect-square rounded-lg border-2 text-2xl ${
                emoji === e ? "border-bark bg-paper" : "border-transparent hover:bg-paper/60"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
        <label className="mt-4 block text-sm font-medium" htmlFor="caption">
          Caption
        </label>
        <textarea
          id="caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={120}
          rows={3}
          required
          placeholder="What are you up to?"
          className="mt-1 w-full rounded-xl border-2 border-bark/30 bg-paper p-3 text-sm"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 font-medium hover:bg-paper">
            Cancel
          </button>
          <DarkButton type="submit">Post</DarkButton>
        </div>
      </form>
    </dialog>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const soon = [...events].sort((a, b) => +parseEventDate(a.date) - +parseEventDate(b.date)).slice(0, 2);
  const items = [
    ...soon.map((e) => `📅 ${e.title} is on ${e.date}`),
    "👥 2 seats left in the MATA22 study group",
    "💬 You have new matches waiting in Friends",
  ];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Notifications"
        className="relative rounded-full p-1.5 hover:bg-card"
      >
        <BellIcon className="h-7 w-7" />
        <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-ember" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-72 rounded-2xl border-2 border-bark bg-paper p-3 shadow-lg">
          <p className="mb-2 font-semibold">Notifications</p>
          <ul className="space-y-2 text-sm">
            {items.map((text) => (
              <li key={text} className="rounded-lg bg-card px-3 py-2">
                {text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <Sidebar />
      <header className="fixed left-[78px] right-0 top-0 z-20 flex h-[52px] items-center justify-between bg-paper px-4 sm:px-6">
        <p className="text-lg font-semibold">{TITLES[pathname] ?? "FriendFinder"}</p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCreating(true)}
            aria-label="Create your own post"
            className="rounded-full p-1.5 hover:bg-card"
          >
            <PlusCircleIcon className="h-7 w-7" />
          </button>
          <Notifications />
        </div>
      </header>
      <main className="min-h-screen pl-[78px] pt-[52px]">
        <div className="mx-auto max-w-6xl p-4 sm:p-6">{children}</div>
      </main>
      {creating && <CreatePostDialog onClose={() => setCreating(false)} />}
    </>
  );
}
