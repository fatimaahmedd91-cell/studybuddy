"use client";

// Shared state for the whole site: who you are, your posts, groups, chats, and events.
// It is saved in this browser (localStorage), so a refresh keeps your demo changes.
// Accounts are the only thing stored on the server so far.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { type AccountUser, fetchMe, getToken, setToken } from "./api";
import { type Post, type Slot, type Student, getStudent, seedPosts, students } from "./data";
import { rankMatches } from "./matching";

export type Message = { from: "me" | "them"; text: string };
export type PlannedEvent = { id: string; title: string; date: string; slot: Slot; location: string };
export type ProfileEdits = Partial<Pick<Student, "name" | "pronouns" | "uni" | "hook">>;

type Saved = {
  meId: number;
  profiles: Record<number, ProfileEdits>;
  myPosts: Post[];
  joinedGroups: number[];
  chats: Record<number, Message[]>;
  plannedEvents: PlannedEvent[];
};

const STORAGE_KEY = "ff_state_v1";
const EMPTY: Saved = { meId: 1, profiles: {}, myPosts: [], joinedGroups: [], chats: {}, plannedEvents: [] };

// The first messages you see with someone, built from what you have in common.
function seedChat(me: Student, friend: Student): Message[] {
  const course = friend.courses.find((c) => me.courses.includes(c));
  const interest = friend.interests.find((i) => me.interests.includes(i));
  const messages: Message[] = [{ from: "them", text: `Hey ${me.name.split(" ")[0]}! 👋` }];
  if (course) messages.push({ from: "them", text: `Are you in ${course} too? Want to study together?` });
  if (interest) messages.push({ from: "me", text: `Yes! And you're into ${interest.toLowerCase()} too, nice.` });
  return messages;
}

type Store = {
  ready: boolean;
  me: Student;
  setMeId: (id: number) => void;
  account: AccountUser | null;
  setAccount: (user: AccountUser | null) => void;
  logout: () => void;
  postsBy: (studentId: number) => Post[];
  addPost: (emoji: string, caption: string) => void;
  updateProfile: (edits: ProfileEdits) => void;
  joinedGroups: number[];
  toggleGroup: (groupId: number) => void;
  chatWith: (friendId: number) => Message[];
  sendMessage: (friendId: number, text: string) => void;
  activeChat: number | null;
  setActiveChat: (friendId: number | null) => void;
  plannedEvents: PlannedEvent[];
  addEvent: (event: Omit<PlannedEvent, "id">) => void;
  resetDemo: () => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSaved] = useState<Saved>(EMPTY);
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [activeChat, setActiveChat] = useState<number | null>(null);

  // Load saved state once, in the browser only (the server build has no localStorage).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSaved({ ...EMPTY, ...JSON.parse(stored) });
    } catch {
      // Ignore broken or blocked storage and start fresh.
    }
    setReady(true);

    if (getToken()) {
      fetchMe()
        .then(setAccount)
        .catch(() => setToken(null)); // Expired or invalid token: log out quietly.
    }
  }, []);

  // Save after every change (but not before the first load finished).
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Storage full or blocked: changes still work until the page is closed.
    }
  }, [saved, ready]);

  // Your profile: the demo student you picked, plus your edits. If you are logged in,
  // your account name is used unless you changed the name yourself.
  const profileEdits = saved.profiles[saved.meId];
  const me = useMemo<Student>(() => {
    const edits = profileEdits ?? {};
    const accountName = account && !edits.name ? { name: account.name } : {};
    return { ...getStudent(saved.meId), ...accountName, ...edits };
  }, [saved.meId, profileEdits, account]);

  const postsBy = useCallback(
    (studentId: number) => {
      const own = studentId === saved.meId ? saved.myPosts : [];
      return [...own, ...seedPosts(getStudent(studentId))];
    },
    [saved.meId, saved.myPosts],
  );

  const chatWith = useCallback(
    (friendId: number) => saved.chats[friendId] ?? seedChat(me, getStudent(friendId)),
    [saved.chats, me],
  );

  const value: Store = {
    ready,
    me,
    setMeId: (id) => {
      setSaved((s) => ({ ...s, meId: id, myPosts: [], chats: {} }));
      setActiveChat(null);
    },
    account,
    setAccount,
    logout: () => {
      setToken(null);
      setAccount(null);
    },
    postsBy,
    addPost: (emoji, caption) =>
      setSaved((s) => ({
        ...s,
        myPosts: [{ id: `mine-${Date.now()}`, authorId: s.meId, emoji, caption }, ...s.myPosts],
      })),
    updateProfile: (changes) =>
      setSaved((s) => ({ ...s, profiles: { ...s.profiles, [s.meId]: { ...s.profiles[s.meId], ...changes } } })),
    joinedGroups: saved.joinedGroups,
    toggleGroup: (groupId) =>
      setSaved((s) => ({
        ...s,
        joinedGroups: s.joinedGroups.includes(groupId)
          ? s.joinedGroups.filter((id) => id !== groupId)
          : [...s.joinedGroups, groupId],
      })),
    chatWith,
    sendMessage: (friendId, text) =>
      setSaved((s) => ({
        ...s,
        chats: { ...s.chats, [friendId]: [...chatWith(friendId), { from: "me", text }] },
      })),
    activeChat,
    setActiveChat,
    plannedEvents: saved.plannedEvents,
    addEvent: (event) =>
      setSaved((s) => ({ ...s, plannedEvents: [...s.plannedEvents, { ...event, id: `plan-${Date.now()}` }] })),
    resetDemo: () => {
      setSaved({ ...EMPTY, meId: saved.meId });
      setActiveChat(null);
    },
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside <StoreProvider>");
  return store;
}

// Your matches, best first. Used by Feed, Friends, Messages, and Screen Time.
export function useMatches() {
  const { me } = useStore();
  return useMemo(() => rankMatches(me, students), [me]);
}
