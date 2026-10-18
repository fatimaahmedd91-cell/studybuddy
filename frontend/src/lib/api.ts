// Every call to the Python backend goes through this file (or a feature file next to it, like
// lib/memories.ts, that uses the get/send helpers exported below). All addresses start with /api/.
import type {
  Conversation,
  FriendEvent,
  FriendsList,
  Group,
  GroupPost,
  Health,
  Insight,
  Message,
  MiniProfile,
  Notification,
  Options,
  OwnProfile,
  Person,
  PrivacyRequest,
  ReportTarget,
  ScreenTime,
} from "./types";

const TOKEN_KEY = "ff_token";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage is blocked (some private windows). The person just stays logged out after a refresh.
  }
}

// Turns FastAPI error bodies into one readable sentence.
function errorMessage(body: unknown, status: number) {
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) {
    const field = detail[0].loc?.at(-1);
    const msg = String(detail[0].msg).replace(/^Value error, /, "");
    return field && field !== "body" ? `${String(field).replaceAll("_", " ")}: ${msg}` : msg;
  }
  if (status === 0) return "Can't reach the server. Check your connection and try again.";
  return `Something went wrong (error ${status}). Please try again.`;
}

// Called when the server says the login is no longer valid (see lib/auth.tsx).
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(errorMessage(null, 0), 0);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError(errorMessage(body, res.status), res.status);
  }
  return body as T;
}

export const get = <T>(path: string) => request<T>(path);
export const send = <T>(method: string, path: string, body?: unknown) =>
  request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export function query(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "" && value !== false) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

type Session = { access_token: string; user: OwnProfile };

export const api = {
  // Accounts
  // accept_terms is the unticked "I am at least 18 … I agree to the Terms" checkbox.
  signup: (email: string, password: string, name: string, accept_terms: boolean, terms_version?: string) =>
    send<Session>("POST", "/api/auth/signup", { email, password, name, accept_terms, terms_version }),
  login: (email: string, password: string) => send<Session>("POST", "/api/auth/login", { email, password }),
  startDemo: () => send<Session>("POST", "/api/auth/demo"),
  me: () => get<OwnProfile>("/api/me"),
  updateMe: (changes: Partial<OwnProfile>) => send<OwnProfile>("PATCH", "/api/me", changes),
  uploadPhoto: (image: string) => send<OwnProfile>("PUT", "/api/me/photo", { image }),
  deletePhoto: () => send<OwnProfile>("DELETE", "/api/me/photo"),
  deleteAccount: () => send<{ deleted: boolean }>("DELETE", "/api/me", { confirm: "DELETE" }),
  options: () => get<Options>("/api/options"),
  acceptTerms: (version: string) => send<OwnProfile>("POST", "/api/me/accept-terms", { accept: true, version }),

  // Settings (see backend/app/account.py)
  changeEmail: (new_email: string, current_password: string) =>
    send<OwnProfile>("PATCH", "/api/me/email", { new_email, current_password }),
  // Returns a fresh token: this browser stays logged in, every other device is logged out.
  changePassword: (current_password: string, new_password: string) =>
    send<{ access_token: string }>("PATCH", "/api/me/password", { current_password, new_password }),
  // Forgot password (no login). The server gives the same answer whether or not the email has an account.
  requestPasswordReset: (email: string) => send<{ message: string }>("POST", "/api/auth/password-reset/request", { email }),
  confirmPasswordReset: (email: string, code: string, new_password: string) =>
    send<{ message: string }>("POST", "/api/auth/password-reset/confirm", { email, code, new_password }),
  changePhone: (phone: string | null) => send<OwnProfile>("PATCH", "/api/me/phone", { phone }),
  setNotificationPrefs: (prefs: Record<string, boolean>) => send<OwnProfile>("PATCH", "/api/me/notification-prefs", prefs),
  setConsent: (key: string, granted: boolean) => send<OwnProfile>("PUT", `/api/me/consents/${key}`, { granted }),
  consents: () => get<{ key: string; description: string; granted: boolean }[]>("/api/me/consents"),
  exportData: () => get<Record<string, unknown>>("/api/me/export"),
  privacyRequests: () => get<PrivacyRequest[]>("/api/privacy-requests"),
  createPrivacyRequest: (kind: PrivacyRequest["kind"], details: string) =>
    send<PrivacyRequest>("POST", "/api/privacy-requests", { kind, details }),

  // Safety (see backend/app/safety.py)
  blocks: () => get<{ person: MiniProfile; blocked_at: string }[]>("/api/blocks"),
  block: (userId: number) => send("POST", "/api/blocks", { user_id: userId }),
  unblock: (userId: number) => send("DELETE", `/api/blocks/${userId}`),
  reportReasons: () => get<{ value: string; label: string }[]>("/api/reports/reasons"),
  report: (report: { target_type: ReportTarget; target_id: number; reason: string; details: string }) =>
    send<{ id: number; status: string }>("POST", "/api/reports", report),

  // People and friends
  people: (filters: { university?: string; interest?: string; goal?: string; free_together?: boolean; q?: string }) =>
    get<{ people: Person[]; universities: string[] }>(`/api/people${query(filters)}`),
  person: (id: number) => get<Person>(`/api/people/${id}`),
  insight: (id: number) => get<Insight>(`/api/people/${id}/insight`),
  friends: () => get<FriendsList>("/api/friends"),
  sendRequest: (userId: number) => send<{ request_id: number; status: string }>("POST", "/api/friends/requests", { user_id: userId }),
  acceptRequest: (id: number) => send("POST", `/api/friends/requests/${id}/accept`),
  declineRequest: (id: number) => send("POST", `/api/friends/requests/${id}/decline`),
  cancelRequest: (id: number) => send("DELETE", `/api/friends/requests/${id}`),
  removeFriend: (userId: number) => send("DELETE", `/api/friends/${userId}`),

  // Messages
  conversations: () => get<Conversation[]>("/api/conversations"),
  messages: (friendId: number, afterId = 0) =>
    get<{ friend: Conversation["friend"]; messages: Message[] }>(`/api/messages/${friendId}${query({ after_id: afterId })}`),
  sendMessage: (friendId: number, body: string) => send<Message>("POST", `/api/messages/${friendId}`, { body }),

  // Groups
  groups: (filters: { q?: string; tag?: string; mine?: boolean }) => get<Group[]>(`/api/groups${query(filters)}`),
  group: (id: number) => get<Group>(`/api/groups/${id}`),
  createGroup: (group: { name: string; description: string; tags: string[] }) => send<Group>("POST", "/api/groups", group),
  joinGroup: (id: number) => send<Group>("POST", `/api/groups/${id}/join`),
  leaveGroup: (id: number) => send<Group>("POST", `/api/groups/${id}/leave`),
  groupPosts: (id: number) => get<GroupPost[]>(`/api/groups/${id}/posts`),
  createGroupPost: (id: number, body: string) => send<GroupPost>("POST", `/api/groups/${id}/posts`, { body }),

  // Events
  events: (filters: { when?: "upcoming" | "past"; group_id?: number }) => get<FriendEvent[]>(`/api/events${query(filters)}`),
  event: (id: number) => get<FriendEvent>(`/api/events/${id}`),
  createEvent: (event: {
    title: string;
    description: string;
    starts_at: string;
    ends_at: string | null;
    location: string;
    online_url: string;
    group_id: number | null;
  }) => send<FriendEvent>("POST", "/api/events", event),
  rsvp: (id: number) => send<FriendEvent>("POST", `/api/events/${id}/rsvp`),
  cancelRsvp: (id: number) => send<FriendEvent>("DELETE", `/api/events/${id}/rsvp`),

  // Notifications
  notifications: () => get<{ items: Notification[]; unread_count: number }>("/api/notifications"),
  markRead: (id: number) => send("POST", `/api/notifications/${id}/read`),
  markAllRead: () => send("POST", "/api/notifications/read-all"),

  // Time in the app
  heartbeat: () => send<{ counted: boolean }>("POST", "/api/screen-time/heartbeat"),
  screenTime: (tz: string) => get<ScreenTime>(`/api/screen-time${query({ tz })}`),

  health: async (): Promise<Health> => {
    // Health answers 503 when the database is down, but its body still explains why.
    const res = await fetch("/api/health");
    return res.json();
  },
};
