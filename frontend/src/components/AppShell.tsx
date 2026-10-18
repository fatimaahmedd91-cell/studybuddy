"use client";

// The frame around every page.
//   Legal pages (/terms, /privacy, /guidelines): open to everyone, no menus.
//   Public pages (/, /login, /signup, /forgot-password): no menus.
//   Logged in but the Terms changed (or were never accepted): the TermsGate screen first.
//   Onboarding: header only.
//   Everything else: header (logo, +, bell), the sidebar on wide screens, a tab bar on phones.
// It also sends logged-out visitors to /login and unfinished profiles to /onboarding.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { MeetkatMark } from "./Brand";
import { CreateMenu, NotificationBell } from "./HeaderActions";
import {
  FeedIcon,
  FriendsIcon,
  GroupsIcon,
  HourglassIcon,
  MemoriesIcon,
  MenuIcon,
  MoreIcon,
  PartyIcon,
  PlanIcon,
  ProfileIcon,
  SettingsIcon,
  ShieldIcon,
} from "./Icons";
import { Loading } from "./States";
import TermsGate from "./TermsGate";

// The navigation. Change the order or labels here.
// "phone: true" items are in the phone tab bar; the rest are under "More" on phones.
const NAV = [
  { href: "/feed", label: "Discover", Icon: FeedIcon, phone: true },
  { href: "/memories", label: "Memories", Icon: MemoriesIcon, phone: true },
  { href: "/plan", label: "Plan", Icon: PlanIcon, phone: true },
  { href: "/friends", label: "Friends", Icon: FriendsIcon, phone: true },
  { href: "/profile", label: "Profile", Icon: ProfileIcon, phone: false },
  { href: "/groups", label: "Groups", Icon: GroupsIcon, phone: false },
  { href: "/events", label: "Events", Icon: PartyIcon, phone: false },
  { href: "/screen-time", label: "Screen Time", Icon: HourglassIcon, phone: false },
];

const PUBLIC_PAGES = ["/", "/login", "/signup", "/forgot-password"];
// Readable by anyone, logged in or not.
export const OPEN_PAGES = ["/terms", "/privacy", "/guidelines"];

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

export function Logo({ href = "/feed" }: { href?: string }) {
  return (
    <Link href={href} className="flex min-h-11 items-center gap-2 text-xl font-extrabold tracking-wide sm:text-2xl">
      <MeetkatMark className="h-9 w-9" />
      {BRAND.name}
    </Link>
  );
}

function Header({ withActions }: { withActions: boolean }) {
  const { me } = useAuth();
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between gap-2 bg-cream px-3 shadow-sm sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <Logo />
        {me?.is_demo && (
          <span className="hidden rounded-full border-2 border-bark bg-sky px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider sm:inline"
            title="This is a demo account with fictional data">
            Demo account
          </span>
        )}
      </div>
      {withActions && (
        <div className="flex items-center gap-1">
          <CreateMenu />
          <NotificationBell />
          <Link href="/settings" aria-label="Settings" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-sky md:hidden">
            <SettingsIcon className="h-6 w-6" />
          </Link>
        </div>
      )}
    </header>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { me } = useAuth();
  const item = (active: boolean) =>
    `flex h-[66px] w-[70px] flex-col items-center justify-center gap-1 rounded-full border-2 text-cream transition ${
      active ? "border-sky-strong bg-cream/10" : "border-transparent hover:border-sky-strong/60"
    }`;
  return (
    <nav aria-label="Main" className="fixed bottom-0 left-0 top-16 z-30 hidden w-[92px] flex-col items-center bg-bark py-3 md:flex">
      <ul className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
        {NAV.map(({ href, label, Icon }) => (
          <li key={href}>
            <Link href={href} aria-current={isActive(pathname, href) ? "page" : undefined} className={item(isActive(pathname, href))}>
              <Icon className="h-6 w-6" />
              <span className="text-center text-[11px] leading-tight">{label}</span>
            </Link>
          </li>
        ))}
        {me && me.role !== "member" && (
          <li>
            <Link href="/moderation" aria-current={pathname === "/moderation" ? "page" : undefined} className={item(pathname === "/moderation")}>
              <ShieldIcon className="h-6 w-6" />
              <span className="text-center text-[11px] leading-tight">Moderation</span>
            </Link>
          </li>
        )}
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
  const { me } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const extra = NAV.filter((n) => !n.phone);
  const moreActive = extra.some((n) => isActive(pathname, n.href)) || pathname === "/moderation";

  // Close the "More" menu when the page changes or when tapping outside it.
  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [moreOpen]);

  const tab = (active: boolean) =>
    `flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-cream ${active ? "bg-forest" : ""}`;
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-sky-strong bg-bark md:hidden">
      <ul className="grid grid-cols-5">
        {NAV.filter((n) => n.phone).map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined} className={tab(active)}>
                <Icon className="h-5 w-5" />
                <span className="text-[10px] leading-tight">{label}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <div ref={moreRef} className="relative">
            <button type="button" aria-expanded={moreOpen} aria-haspopup="menu" onClick={() => setMoreOpen(!moreOpen)}
              className={tab(moreActive)}>
              <MoreIcon className="h-5 w-5" />
              <span className="text-[10px] leading-tight">More</span>
            </button>
            {moreOpen && (
              <ul role="menu" className="absolute bottom-full right-1 mb-2 w-52 overflow-hidden rounded-2xl border-2 border-bark bg-cream text-bark shadow-lg">
                {extra.map(({ href, label, Icon }) => (
                  <li key={href} role="none">
                    <Link role="menuitem" href={href} aria-current={isActive(pathname, href) ? "page" : undefined}
                      className="flex min-h-12 items-center gap-3 px-4 hover:bg-sky">
                      <Icon className="h-5 w-5" /> {label}
                    </Link>
                  </li>
                ))}
                {me && me.role !== "member" && (
                  <li role="none">
                    <Link role="menuitem" href="/moderation" className="flex min-h-12 items-center gap-3 px-4 hover:bg-sky">
                      <ShieldIcon className="h-5 w-5" /> Moderation
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </div>
        </li>
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
  const isOpen = OPEN_PAGES.includes(pathname);
  const isPublic = PUBLIC_PAGES.includes(pathname);
  const termsOk = !me || me.terms.current;

  // Send people to the right place for their login state.
  useEffect(() => {
    if (isOpen) return;
    if (status === "anonymous" && !isPublic) router.replace("/login");
    if (status === "ready" && me && termsOk) {
      if (!me.onboarded && pathname !== "/onboarding") router.replace("/onboarding");
      else if (me.onboarded && (isPublic || pathname === "/onboarding")) router.replace("/feed");
    }
  }, [status, me, termsOk, pathname, isOpen, isPublic, router]);

  if (isOpen) return <>{children}</>;
  if (status === "loading") return <FullPageLoading />;
  if (status === "ready" && me && !termsOk) return <TermsGate />;
  if (isPublic) return status === "anonymous" ? <>{children}</> : <FullPageLoading />;
  if (status !== "ready" || !me) return <FullPageLoading />;
  if (!me.onboarded && pathname !== "/onboarding") return <FullPageLoading />;
  return <LoggedIn onboarding={pathname === "/onboarding"}>{children}</LoggedIn>;
}

function LoggedIn({ onboarding, children }: { onboarding: boolean; children: React.ReactNode }) {
  useHeartbeat();
  return (
    <>
      <a href="#main" className="sr-only z-50 rounded bg-bark px-4 py-2 text-cream focus:not-sr-only focus:fixed focus:left-2 focus:top-2">
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
