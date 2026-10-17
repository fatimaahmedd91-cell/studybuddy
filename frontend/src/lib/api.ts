// Talks to the Python backend. All calls go to /api/... on the same address as the site.
import type { Match } from "./matching";

const TOKEN_KEY = "ff_token";

export type AccountUser = { id: number; email: string; name: string; created_at: string };

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
    // Storage blocked (private window). The user just stays logged out.
  }
}

// Turns FastAPI error bodies into one readable sentence.
function errorMessage(body: unknown, status: number) {
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) {
    const field = detail[0].loc?.at(-1);
    return field ? `${field}: ${detail[0].msg}` : detail[0].msg;
  }
  return `Something went wrong (${status})`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(errorMessage(body, res.status));
  return body as T;
}

type TokenResponse = { access_token: string; user: AccountUser };

export async function signup(email: string, password: string, name: string) {
  const data = await request<TokenResponse>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
  setToken(data.access_token);
  return data.user;
}

export async function login(email: string, password: string) {
  const data = await request<TokenResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.access_token);
  return data.user;
}

export function fetchMe() {
  return request<AccountUser>("/api/me");
}

export type Health = {
  status: string;
  database: { ok: boolean; detail: string };
  gemini: { ok: boolean; detail: string };
};

export async function fetchHealth(): Promise<Health> {
  // Health answers 503 when something is down, but the body is still useful.
  const res = await fetch("/api/health");
  return res.json();
}

// Asks Gemini (through our backend) why two people might get along.
// Sends only what they share: interests, courses, and free times. Never names.
export async function fetchInsight(match: Match) {
  const data = await request<{ text: string }>("/api/insight", {
    method: "POST",
    body: JSON.stringify({
      sharedInterests: match.sharedInterests,
      sharedCourses: match.sharedCourses,
      sharedSlots: match.sharedSlots,
    }),
  });
  return data.text;
}
