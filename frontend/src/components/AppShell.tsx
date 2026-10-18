"use client";

// The frame around every page.
//   Public pages (/, /login, /signup): no menus.
//   Onboarding: header only.
//   Everything else: header (logo, +, bell), the sidebar on wide screens, a tab bar on phones.
// It also sends logged-out visitors to /login and unfinished profiles to /onboarding.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CreateMenu, NotificationBell } from "./HeaderActions";
import { FeedIcon, FriendsIcon, GroupsIcon, HourglassIcon, MenuIcon, PartyIcon, ProfileIcon, SettingsIcon } from "./Icons";
import { Loading } from "./States";

// The sidebar. Change the order or labels here.
const NAV = [
  { href: "/feed", label: "Feed", Icon: FeedIcon },
  { href: "/profile", label: "Profile", Icon: ProfileIcon },
  { href: "/groups", label: "Groups", Icon: GroupsIcon },
  { href: "/screen-time", label: "Screen Time", Icon: HourglassIcon },
  { href: "/events", label: "Events", Icon: PartyIcon },
  { href: "/friends", label: "Friends", Icon: FriendsIcon },
];

const PUBLIC_PAGES = ["/", "/login", "/signup"];

function isActive(pathname: string, href: string) {
  if (href === "/friends") return pathname === "/friends" || pathname === "/messages";
  return pathname === href;
}

// Counts time in the app: every 30 seconds, if this tab is visible and was used in the last
// minute, tell the server. Hidden or idle tabs send nothing. See backend/app/screen_time.py.
function useHeartbeat() {
  useEffect(() => {
    let lastActivity = Date.now();
    const mark = () => (lastActivity = Date.now());
    const events = ["pointerdown", "keydown", "scroll", "pointermove", "touchstart"];
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastActivity < 60_000) {
        api.heartbeat().catch(() => undefined);
      }
    }, 30_000);
    return () => {
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, mark));
    };
  }, []);
}

function Logo() {
  return (
    <Link href="/feed" className="flex min-h-11 items-center gap-2 text-xl font-extrabold tracking-wide sm:text-2xl">
      <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-bark text-lg text-paper">
        ff
      </span>
      FriendFinder
    </Link>
  );
}

function Header({ withActions }: { withActions: boolean }) {
  const { me } = useAuth();
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between gap-2 bg-paper px-3 shadow-sm sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <Logo />
        {me?.is_demo && (
          <span className="hidden rounded-full border-2 border-bark bg-ice px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider sm:inline"
            title="This is a demo account with fictional data">
            Demo account
          </span>
        )}
      </div>
      {withActions && (
        <div className="flex items-center gap-1">
          <CreateMenu />
          <NotificationBell />
          <Link href="/settings" aria-label="Settings" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-card md:hidden">
            <SettingsIcon className="h-6 w-6" />
          </Link>
        </div>
      )}
    </header>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const item = (active: boolean) =>
    `flex h-[70px] w-[70px] flex-col items-center justify-center gap-1 rounded-full border-2 text-paper transition ${
      active ? "border-ember bg-paper/10" : "border-transparent hover:border-ember/60"
    }`;
  return (
    <nav aria-label="Main" className="fixed bottom-0 left-0 top-16 z-30 hidden w-[92px] flex-col items-center bg-bark py-4 md:flex">
      <ul className="flex flex-1 flex-col items-center gap-2 overflow-y-auto">
        {NAV.map(({ href, label, Icon }) => (
          <li key={href}>
            <Link href={href} aria-current={isActive(pathname, href) ? "page" : undefined} className={item(isActive(pathname, href))}>
              <Icon className="h-6 w-6" />
              <span className="text-center text-[11px] leading-tight">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/settings" aria-label="Settings" aria-current={pathname === "/settings" ? "page" : undefined}
        className={item(pathname === "/settings")}>
        <MenuIcon className="h-7 w-7" />
      </Link>
    </nav>
  );
}

function MobileNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-ember bg-bark md:hidden">
      <ul className="grid grid-cols-6">
        {NAV.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-paper ${active ? "bg-ember/30" : ""}`}>
                <Icon className="h-5 w-5" />
                <span className="text-[10px] leading-tight">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function FullPageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loading />
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { status, me } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PAGES.includes(pathname);

  // Send people to the right place for their login state.
  useEffect(() => {
    if (status === "anonymous" && !isPublic) router.replace("/login");
    if (status === "ready" && me) {
      if (!me.onboarded && pathname !== "/onboarding") router.replace("/onboarding");
      else if (me.onboarded && (isPublic || pathname === "/onboarding")) router.replace("/feed");
    }
  }, [status, me, pathname, isPublic, router]);

  if (status === "loading") return <FullPageLoading />;
  if (isPublic) return status === "anonymous" ? <>{children}</> : <FullPageLoading />;
  if (status !== "ready" || !me) return <FullPageLoading />;
  if (!me.onboarded && pathname !== "/onboarding") return <FullPageLoading />;
  return <LoggedIn onboarding={pathname === "/onboarding"}>{children}</LoggedIn>;
}

function LoggedIn({ onboarding, children }: { onboarding: boolean; children: React.ReactNode }) {
  useHeartbeat();
  return (
    <>
      <a href="#main" className="sr-only z-50 rounded bg-bark px-4 py-2 text-paper focus:not-sr-only focus:fixed focus:left-2 focus:top-2">
        Skip to content
      </a>
      <Header withActions={!onboarding} />
      {!onboarding && <Sidebar />}
      {!onboarding && <MobileNav />}
      <main id="main" className={`min-h-screen pt-16 ${onboarding ? "" : "pb-20 md:pb-0 md:pl-[92px]"}`}>
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">{children}</div>
      </main>
    </>
  );
}
