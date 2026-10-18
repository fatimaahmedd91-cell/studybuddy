// The shapes of the data the backend sends. They match the Python code in backend/app/.

export type Availability = Partial<Record<string, string[]>>; // {"Mon": ["morning", "evening"]}

export type MiniProfile = {
  id: number;
  name: string;
  avatar_emoji: string;
  avatar_color: string;
  photo_url: string | null;
  is_demo: boolean;
};

export type PublicProfile = MiniProfile & {
  pronouns: string;
  age: number | null;
  university: string;
  hook: string;
  bio: string;
  interests: string[];
  looking_for: string[];
  stickers: boolean;
  // Specific checks only, e.g. ["email_verified"]. There is no general "verified" badge.
  badges: Badge[];
};

export type Badge = "email_verified" | "phone_verified" | "age_checked";
export type Audience = "everyone" | "friends" | "nobody";

export type OwnProfile = PublicProfile & {
  email: string;
  email_verified: boolean;
  phone: string | null;
  phone_verified: boolean;
  availability: Availability;
  availability_audience: Audience;
  daily_goal_minutes: number | null;
  onboarded: boolean;
  timezone: string;
  discoverable: boolean;
  notification_prefs: Record<string, boolean>;
  consents: Record<string, boolean>;
  role: "member" | "moderator" | "admin";
  age_check: { status: string | null; provider: string | null; at: string | null };
  terms: { accepted_version: string | null; accepted_at: string | null; current_version: string; current: boolean };
};

export type Slot = { day: string; slot: string };

export type Match = {
  score: number;
  reasons: string[];
  shared_interests: string[];
  shared_goals: string[];
  same_university: boolean;
  overlap: Slot[];
};

export type RelationshipStatus = "none" | "outgoing" | "incoming" | "friends";
export type Relationship = { status: RelationshipStatus; request_id: number | null };

export type Person = PublicProfile & { match: Match; relationship: Relationship; is_me?: boolean };

export type Options = {
  friendship_goals: string[];
  suggested_interests: string[];
  suggested_universities: string[];
  days: string[];
  slots: string[];
  min_age: number;
  terms_version: string;
  notification_categories: Record<string, string>;
};

export type FriendEntry = { request_id: number; person: PublicProfile; since?: string; sent_at?: string };
export type FriendsList = { friends: FriendEntry[]; incoming: FriendEntry[]; outgoing: FriendEntry[] };

export type Message = { id: number; body: string; created_at: string; from_me: boolean };
export type Conversation = {
  friend: MiniProfile;
  last_message: { body: string; created_at: string; from_me: boolean } | null;
  unread: number;
};

export type Group = {
  id: number;
  name: string;
  description: string;
  tags: string[];
  member_count: number;
  is_member: boolean;
  is_owner: boolean;
  is_demo: boolean;
  next_event_at: string | null;
  created_at: string;
  members?: MiniProfile[];
  events?: { id: number; title: string; starts_at: string; location: string; online_url: string; going_count: number }[];
};

export type GroupPost = { id: number; body: string; created_at: string; author: MiniProfile; mine: boolean };

export type FriendEvent = {
  id: number;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  online_url: string;
  group: { id: number; name: string } | null;
  organiser: MiniProfile | null;
  is_organiser: boolean;
  going_count: number;
  is_going: boolean;
  has_ended: boolean;
  is_demo: boolean;
  attendees?: MiniProfile[];
};

export type Notification = {
  id: number;
  kind: string;
  text: string;
  link: string;
  created_at: string;
  read: boolean;
  actor: MiniProfile | null;
};

export type Insight = {
  explanation: string;
  conversation_starter: string;
  activity: string;
  source: "gemini" | "fallback";
  model: string | null;
  fallback_reason: string | null;
  facts_sent: {
    shared_interests: string[];
    shared_friendship_goals: string[];
    same_university: string | null;
    both_free: string[];
  };
  cached: boolean;
};

export type ScreenTime = {
  today_seconds: number;
  week: { date: string; seconds: number }[];
  goal_minutes: number | null;
  heartbeat_seconds: number;
  storage: "timescaledb" | "postgresql";
};

export type Health = {
  status: string;
  database: { ok: boolean; detail: string; timescaledb?: boolean };
  gemini: { ok: boolean; detail: string };
  demo_mode: boolean;
};

export type ReportTarget = "profile" | "message" | "memory" | "group" | "event" | "group_post";

export type PrivacyRequest = {
  id: number;
  kind: "access" | "correction" | "deletion" | "withdraw_consent" | "other";
  details: string;
  status: "open" | "done";
  created_at: string;
  handled_at: string | null;
};
