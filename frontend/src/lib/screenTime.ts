// Self-reported screen time and screen-time groups. Matches backend/app/screen_time_groups.py.
// (Time spent in Meerkat itself is in lib/api.ts: api.screenTime and api.heartbeat.)
import { get, query, send } from "./api";
import type { MiniProfile } from "./types";

// Each group uses ONE measurement, so different kinds of numbers are never ranked together.
export type Metric = "self_reported" | "in_app";

export const METRIC_BADGE: Record<Metric, string> = {
  self_reported: "Self-reported",
  in_app: "Time in Meerkat",
};

export type Entry = { day: string; minutes: number; updated_at: string };

export type StGroup = {
  id: number;
  name: string;
  description: string;
  metric: Metric;
  metric_label: string;
  daily_target_minutes: number; // per person, per day
  timezone: string;
  member_count: number;
  my_status: "active" | "invited";
  created_at: string;
  consent_text?: string;
  invited_by?: MiniProfile | null;
  invited_at?: string;
  // Only for active members:
  members?: MiniProfile[];
  invited?: MiniProfile[];
  created_by_me?: boolean;
};

export type LeaderboardRow = {
  rank: number;
  person: MiniProfile;
  is_me: boolean;
  minutes: number;
  difference_minutes: number; // positive = over the target
  over_target: boolean;
  updated_at: string | null;
};

export type Leaderboard = {
  group_id: number;
  group_name: string;
  day: string;
  timezone: string;
  metric: Metric;
  metric_label: string;
  unit: "minutes";
  target_minutes: number;
  ranked: LeaderboardRow[];
  no_entry: { person: MiniProfile; is_me: boolean }[]; // missing is NOT zero
  updated_at: string | null;
};

export type InviteResult = {
  invited: number[];
  skipped: { user_id: number; reason: "yourself" | "not_friends" | "already_member" | "already_invited" }[];
};

export const screenTimeApi = {
  entries: (days = 14) => get<{ entries: Entry[]; window_days: number }>(`/api/screen-time/entries${query({ days })}`),
  saveEntry: (day: string, minutes: number) => send<Entry>("PUT", `/api/screen-time/entries/${day}`, { minutes }),
  deleteEntry: (day: string) => send("DELETE", `/api/screen-time/entries/${day}`),

  groups: () => get<{ groups: StGroup[]; invitations: StGroup[] }>("/api/screen-time/groups"),
  createGroup: (group: { name: string; description: string; metric: Metric; daily_target_minutes: number }) =>
    send<StGroup>("POST", "/api/screen-time/groups", group),
  group: (id: number) => get<StGroup>(`/api/screen-time/groups/${id}`),
  invite: (id: number, userIds: number[]) =>
    send<InviteResult>("POST", `/api/screen-time/groups/${id}/invite`, { user_ids: userIds }),
  // share: true means "I read what will be shared and I agree".
  accept: (id: number) => send<StGroup>("POST", `/api/screen-time/groups/${id}/accept`, { share: true }),
  decline: (id: number) => send("POST", `/api/screen-time/groups/${id}/decline`),
  leave: (id: number) => send("POST", `/api/screen-time/groups/${id}/leave`),
  leaderboard: (id: number, day?: string) =>
    get<Leaderboard>(`/api/screen-time/groups/${id}/leaderboard${query({ day })}`),
};

// "YYYY-MM-DD" for today (plus offsetDays) in a time zone, e.g. isoDay("America/Toronto", -1) = yesterday.
export function isoDay(timeZone: string, offsetDays = 0) {
  let today: string;
  try {
    today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    today = new Date().toISOString().slice(0, 10);
  }
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

// "Fri, Oct 17" for a "YYYY-MM-DD" day.
export function dayLabel(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// 125 -> "2 h 5 min", 120 -> "2 h", 45 -> "45 min"
export function minutesLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${Math.floor(minutes / 60)} h`;
}
