// Calls and data shapes for private schedules and hangout planning.
// The matching Python code is backend/app/commitments.py and backend/app/planning.py.
import { get, query, send } from "./api";
import type { FriendEvent, MiniProfile } from "./types";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type CommitmentKind = "class" | "work" | "other";

// What you type in the form (times are "HH:MM", dates "YYYY-MM-DD").
export type CommitmentInput = {
  title: string;
  kind: CommitmentKind;
  location: string;
  recurrence: "none" | "weekly";
  weekday: number | null;
  start_date: string;
  end_date: string | null;
  start_time: string;
  end_time: string;
  timezone?: string | null;
};

export type Commitment = CommitmentInput & {
  id: number;
  overnight: boolean;
  timezone: string;
  source: "manual" | "ics" | "ai";
  created_at: string;
  updated_at: string;
};

// An imported entry waiting for review. Times or dates can be missing (null) until you fill them in.
export type Proposal = Omit<CommitmentInput, "start_time" | "end_time" | "start_date"> & {
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  timezone: string;
  source: "ics" | "ai";
  import_key: string;
  warnings: string[];
  flags: { uncertain_time: boolean; missing_dates: boolean; ambiguous_recurrence: boolean };
};

export type ParticipantStatus = "included" | "public_only" | "no_availability";

export type Slot = { id: string; start: string; end: string; minutes: number; label: string };

export type PlanResult = {
  context: { type: "friends" | "group"; group_id: number | null };
  timezone: string;
  start_date: string;
  end_date: string;
  duration_minutes: number;
  participants: { person: MiniProfile; status: ParticipantStatus; note: string }[];
  slots: Slot[];
  computed_at: string;
  message: string | null;
};

export type PlanPeople = { friend_ids?: number[]; group_id?: number };
export type PlanRequest = PlanPeople & { start_date: string; end_date: string; duration_minutes: number };

export type Suggestion = {
  source: "gemini" | "fallback";
  fallback_reason: string | null;
  model: string | null;
  summary: string;
  ranked_slots: Slot[];
  activities: { title: string; reason: string }[];
  plan: { slot: Slot | null; text: string };
  facts_sent: Record<string, unknown> | null;
  generated_at: string;
  cached: boolean;
};

export type Venue = {
  name: string;
  address: string | null;
  maps_url: string | null;
  open_now: boolean | null;
  price_level: string | null;
};

export type AreaResult = {
  used_count: number;
  total: number;
  query: string;
  midpoint: { lat: number; lng: number; label: string; maps_url: string } | null;
  source: "google_places" | "links" | null;
  venues: Venue[];
  links: { label: string; url: string; note: string }[];
  notice: string | null;
};

export type MeetingOrigin = { label: string; lat: number; lng: number; source: "preset" | "device"; updated_at: string };
export type AreaPreset = { key: string; label: string; lat: number; lng: number };
export type PlanningConsents = { friends: boolean; groups: { id: number; name: string; allowed: boolean }[] };

export const planning = {
  // Your private schedule
  commitments: () => get<{ commitments: Commitment[]; buffer_minutes: number; timezone: string }>("/api/commitments"),
  addCommitment: (c: CommitmentInput) => send<Commitment>("POST", "/api/commitments", c),
  updateCommitment: (id: number, c: Partial<CommitmentInput>) => send<Commitment>("PATCH", `/api/commitments/${id}`, c),
  deleteCommitment: (id: number) => send("DELETE", `/api/commitments/${id}`),
  setBuffer: (buffer_minutes: number) => send<{ buffer_minutes: number }>("PATCH", "/api/me/schedule-settings", { buffer_minutes }),
  importIcs: (text: string) => send<{ proposals: Proposal[]; count: number }>("POST", "/api/commitments/import/ics", { text }),
  importWithAi: (file: string) =>
    send<{ proposals: Proposal[]; count: number }>("POST", "/api/commitments/import/ai", { file, consent: true }),
  saveReviewed: (entries: (CommitmentInput & { import_key?: string | null })[], source: "ics" | "ai") =>
    send<{ saved: number; skipped_duplicates: number }>("POST", "/api/commitments/bulk", { entries, source }),

  // Planning
  slots: (body: PlanRequest) => send<PlanResult>("POST", "/api/planning/slots", body),
  suggest: (body: PlanRequest & { slots: { start: string; end: string }[]; refresh: boolean }) =>
    send<Suggestion>("POST", "/api/planning/suggest", body),
  area: (body: PlanPeople & { activity: string; budget: "any" | "cheap" | "moderate" }) =>
    send<AreaResult>("POST", "/api/planning/area", body),
  createEvent: (body: {
    title: string;
    description: string;
    starts_at: string;
    ends_at: string | null;
    location: string;
    online_url: string;
    invitee_ids: number[];
    group_id: number | null;
  }) => send<{ event: FriendEvent; invited: number; invitee_count: number }>("POST", "/api/planning/create-event", body),

  // Who may use your private schedule
  consents: () => get<PlanningConsents>("/api/planning/consents"),
  allow: (scope: "friends" | "group", group_id?: number) => send<PlanningConsents>("PUT", "/api/planning/consents", { scope, group_id }),
  revoke: (scope: "friends" | "group", group_id?: number) =>
    send<PlanningConsents>("DELETE", `/api/planning/consents${query({ scope, group_id })}`),

  // Your meeting area
  presets: () => get<AreaPreset[]>("/api/planning/area-presets"),
  origin: () => get<{ origin: MeetingOrigin | null; consent: boolean }>("/api/me/meeting-origin"),
  setOrigin: (body: { preset: string } | { lat: number; lng: number; label?: string }) =>
    send<{ origin: MeetingOrigin; consent: boolean }>("PUT", "/api/me/meeting-origin", body),
  deleteOrigin: () => send<{ origin: null; consent: boolean }>("DELETE", "/api/me/meeting-origin"),
};

// "14:00" in a time zone, for slot times.
export function clock(iso: string, timeZone?: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone });
}

export function dayLabel(iso: string, timeZone?: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone });
}

// "YYYY-MM-DD" for a date some days from today, in local time.
export function isoDay(daysFromToday = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
