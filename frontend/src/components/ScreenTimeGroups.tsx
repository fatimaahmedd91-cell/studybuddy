"use client";

// Screen-time accountability groups (the "Groups" tab of /screen-time).
// The server decides who can see what (backend/app/screen_time_groups.py); this file only shows it.
// Ground rules shown to people:
//   - Each group uses ONE kind of number (self-reported OR time in Meetkat), never mixed.
//   - The target is per person, per day.
//   - Joining needs an explicit "Join and share". Leaving hides all of your numbers from the group.
//   - Missing entries are listed as "No entry", never counted as zero.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import {
  type InviteResult,
  type Leaderboard,
  type Metric,
  METRIC_BADGE,
  type StGroup,
  dayLabel,
  isoDay,
  minutesLabel,
  screenTimeApi,
} from "@/lib/screenTime";
import { formatDateTime } from "@/lib/time";
import { useApi } from "@/lib/useApi";
import Avatar from "./Avatar";
import Dialog from "./Dialog";
import { Empty, ErrorBox, Loading, Notice } from "./States";
import { Button, Field, FrameCard, inputClass } from "./ui";

export function MetricBadge({ metric }: { metric: Metric }) {
  return (
    <span className="inline-block rounded-full bg-bark px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-cream">
      {METRIC_BADGE[metric]}
    </span>
  );
}

function targetText(group: Pick<StGroup, "daily_target_minutes">) {
  return `Target: ${minutesLabel(group.daily_target_minutes)} per person, per day`;
}

// ---------- The list of groups and invitations ----------

export function GroupsList() {
  const router = useRouter();
  const { data, error, loading, reload } = useApi(() => screenTimeApi.groups(), []);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold">Screen-time groups</h2>
          <p className="mt-1 text-sm">
            Agree on a daily target with friends and keep each other honest. Each group uses one kind of number, so
            nobody&apos;s compared unfairly.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>+ Create group</Button>
      </div>

      {loading && <Loading label="Loading groups…" />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {data && data.invitations.length > 0 && (
        <section aria-labelledby="invites-title" className="space-y-3">
          <h3 id="invites-title" className="text-xl font-bold">Invitations</h3>
          {data.invitations.map((group) => (
            <InvitationCard key={group.id} group={group}
              onJoined={() => router.push(`/screen-time?group=${group.id}`)} onDeclined={reload} />
          ))}
        </section>
      )}

      {data && (
        <section aria-labelledby="mine-title" className="space-y-3">
          <h3 id="mine-title" className="text-xl font-bold">Your groups</h3>
          {data.groups.length === 0 ? (
            <Empty title="You're not in a screen-time group yet">
              Create one and invite friends, or accept an invitation above.
            </Empty>
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {data.groups.map((group) => (
                <li key={group.id}>
                  <Link href={`/screen-time?group=${group.id}`} className="block h-full rounded-frame hover:brightness-95">
                    <FrameCard className="h-full">
                      <div className="space-y-1 p-4">
                        <p className="text-xl font-bold">{group.name}</p>
                        <MetricBadge metric={group.metric} />
                        <p className="text-sm">{targetText(group)}</p>
                        <p className="text-sm">{group.member_count} member{group.member_count === 1 ? "" : "s"}</p>
                      </div>
                    </FrameCard>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {creating && (
        <CreateGroupDialog onClose={() => setCreating(false)}
          onCreated={(group) => router.push(`/screen-time?group=${group.id}`)} />
      )}
    </div>
  );
}

function InvitationCard({ group, onJoined, onDeclined }: { group: StGroup; onJoined: () => void; onDeclined: () => void }) {
  const [consenting, setConsenting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decline() {
    setBusy(true);
    setError(null);
    try {
      await screenTimeApi.decline(group.id);
      onDeclined();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Please try again.");
      setBusy(false);
    }
  }

  return (
    <FrameCard>
      <div className="space-y-2 p-4">
        <p className="text-xl font-bold">{group.name}</p>
        <div className="flex flex-wrap items-center gap-2">
          <MetricBadge metric={group.metric} />
          <span className="text-sm">{targetText(group)}</span>
        </div>
        {group.description && <p className="text-sm">{group.description}</p>}
        {group.invited_by && <p className="text-sm">Invited by <b>{group.invited_by.name}</b></p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={() => setConsenting(true)} disabled={busy}>Accept…</Button>
          <Button variant="outline" onClick={decline} disabled={busy}>Decline</Button>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
      </div>
      {consenting && <ConsentDialog group={group} onClose={() => setConsenting(false)} onJoined={onJoined} />}
    </FrameCard>
  );
}

function ConsentDialog({ group, onClose, onJoined }: { group: StGroup; onClose: () => void; onJoined: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      await screenTimeApi.accept(group.id);
      onJoined();
    } catch (err) {
      setError(err instanceof Error ? err.message : "You weren't added. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Join ${group.name}?`} onClose={onClose}>
      <div className="space-y-3">
        <p>{group.consent_text}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>What this group compares: <b>{group.metric_label}</b>.</li>
          <li>You can leave any time. After you leave, the group no longer sees any of your numbers, including earlier days.</li>
        </ul>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={join} disabled={busy}>{busy ? "Joining…" : "Join and share"}</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Dialog>
  );
}

const METRIC_CHOICES: { value: Metric; title: string; text: string }[] = [
  {
    value: "self_reported",
    title: "Self-reported phone screen time",
    text: "Everyone types in their own daily total from their phone. Meetkat doesn't check it.",
  },
  {
    value: "in_app",
    title: "Time in Meetkat",
    text: "Measured automatically, but only time spent in this app, not your whole phone.",
  },
];

function CreateGroupDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (group: StGroup) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [metric, setMetric] = useState<Metric>("self_reported");
  const [target, setTarget] = useState("120");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const minutes = Number(target);
    if (!name.trim()) return setError("Give your group a name.");
    if (!Number.isInteger(minutes) || minutes < 10 || minutes > 1440) {
      return setError("Pick a target from 10 to 1440 minutes (24 hours).");
    }
    setBusy(true);
    setError(null);
    try {
      onCreated(await screenTimeApi.createGroup({ name: name.trim(), description: description.trim(), metric, daily_target_minutes: minutes }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The group wasn't created.");
      setBusy(false);
    }
  }

  return (
    <Dialog title="Create a screen-time group" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Group name" htmlFor="stg-name">
          <input id="stg-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={inputClass}
            placeholder="Phone-down crew" />
        </Field>
        <Field label="Description (optional)" htmlFor="stg-desc">
          <textarea id="stg-desc" maxLength={300} rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
            className={inputClass} />
        </Field>
        <fieldset>
          <legend className="text-sm font-semibold">What will the group compare?</legend>
          <div className="mt-1 space-y-2">
            {METRIC_CHOICES.map((choice) => (
              <label key={choice.value} className="flex min-h-11 items-start gap-3 rounded-xl border-2 border-bark/20 bg-cream p-3">
                <input type="radio" name="metric" value={choice.value} checked={metric === choice.value}
                  onChange={() => setMetric(choice.value)} className="mt-1 h-5 w-5 shrink-0 accent-bark" />
                <span>
                  <span className="block font-semibold">{choice.title}</span>
                  <span className="block text-sm">{choice.text}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs">You can&apos;t change this later, so different kinds of numbers are never mixed.</p>
        </fieldset>
        <Field label="Daily target (minutes per person, per day)" htmlFor="stg-target"
          hint="Everyone aims to stay under this each day. It isn't a total for the whole group.">
          <input id="stg-target" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))}
            className={`${inputClass} w-32`} />
        </Field>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create group"}</Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------- One group ----------

export function GroupDetail({ id }: { id: number }) {
  const router = useRouter();
  const { data: group, error, loading, reload } = useApi(() => screenTimeApi.group(id), [id]);
  const [inviting, setInviting] = useState(false);
  const [leaving, setLeaving] = useState(false);

  if (loading) return <Loading label="Loading group…" />;
  if (error || !group) {
    return (
      <div className="space-y-3">
        <ErrorBox message={error ?? "This screen-time group could not be found."} onRetry={reload} />
        <Link href="/screen-time?tab=groups" className="font-semibold underline">← All screen-time groups</Link>
      </div>
    );
  }

  if (group.my_status === "invited") {
    return (
      <div className="space-y-4">
        <Link href="/screen-time?tab=groups" className="font-semibold underline">← All screen-time groups</Link>
        <InvitationCard group={group} onJoined={reload} onDeclined={() => router.push("/screen-time?tab=groups")} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link href="/screen-time?tab=groups" className="font-semibold underline">← All screen-time groups</Link>
      <FrameCard>
        <div className="space-y-3 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-3xl font-bold">{group.name}</h2>
            <MetricBadge metric={group.metric} />
          </div>
          <p className="font-semibold">{targetText(group)}</p>
          {group.description && <p className="max-w-2xl whitespace-pre-line">{group.description}</p>}
          <p className="text-sm">Days run from midnight to midnight in {group.timezone}.</p>
          <div>
            <p className="text-sm font-semibold">Members ({group.members?.length ?? 0})</p>
            <ul className="mt-1 flex flex-wrap gap-3">
              {group.members?.map((m) => (
                <li key={m.id} className="flex flex-col items-center gap-1 text-xs">
                  <Avatar person={m} size="sm" />
                  <span className="max-w-20 truncate">{m.name.split(" ")[0]}</span>
                </li>
              ))}
            </ul>
            {group.invited && group.invited.length > 0 && (
              <p className="mt-2 text-sm">Invited, waiting to answer: {group.invited.map((m) => m.name).join(", ")}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setInviting(true)}>Invite friends</Button>
            <Button variant="danger" onClick={() => setLeaving(true)}>Leave group</Button>
          </div>
        </div>
      </FrameCard>

      <LeaderboardPanel group={group} />

      {inviting && <InviteDialog group={group} onClose={() => setInviting(false)} onInvited={reload} />}
      {leaving && <LeaveDialog group={group} onClose={() => setLeaving(false)} onLeft={() => router.push("/screen-time?tab=groups")} />}
    </div>
  );
}

const SKIP_REASONS: Record<InviteResult["skipped"][number]["reason"], string> = {
  yourself: "that's you",
  not_friends: "you can only invite friends",
  already_member: "already in the group",
  already_invited: "already invited",
};

function InviteDialog({ group, onClose, onInvited }: { group: StGroup; onClose: () => void; onInvited: () => void }) {
  const { data, error, loading, reload } = useApi(() => api.friends(), []);
  const [chosen, setChosen] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "success" | "error" | "warning"; text: string } | null>(null);
  const taken = new Set([...(group.members ?? []), ...(group.invited ?? [])].map((m) => m.id));
  const friends = (data?.friends ?? []).map((f) => f.person).filter((p) => !taken.has(p.id));

  async function send() {
    if (chosen.length === 0) return setResult({ kind: "error", text: "Pick at least one friend." });
    setBusy(true);
    setResult(null);
    try {
      const outcome = await screenTimeApi.invite(group.id, chosen);
      const names = (ids: number[]) => friends.filter((f) => ids.includes(f.id)).map((f) => f.name);
      const skipped = outcome.skipped.map((s) => `${names([s.user_id])[0] ?? "Someone"} (${SKIP_REASONS[s.reason]})`);
      if (outcome.invited.length > 0) {
        setResult({
          kind: skipped.length ? "warning" : "success",
          text: `Invitation sent to ${names(outcome.invited).join(", ")}.${skipped.length ? ` Not sent: ${skipped.join(", ")}.` : ""}`,
        });
        setChosen([]);
        onInvited();
      } else {
        setResult({ kind: "error", text: `No invitations sent: ${skipped.join(", ")}.` });
      }
    } catch (err) {
      setResult({ kind: "error", text: err instanceof Error ? err.message : "The invitations weren't sent." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Invite friends to ${group.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm">
          They&apos;ll get a notification, and they only join if they agree to share their{" "}
          {group.metric === "self_reported" ? "self-reported" : "in-app"} totals.
        </p>
        {loading && <Loading label="Loading friends…" />}
        {error && <ErrorBox message={error} onRetry={reload} />}
        {data && friends.length === 0 && (
          <Empty title="No one to invite">
            Everyone you&apos;re friends with is already here or invited, or you haven&apos;t added friends yet.
          </Empty>
        )}
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {friends.map((friend) => (
            <li key={friend.id}>
              <label className="flex min-h-12 items-center gap-3 rounded-xl px-2 hover:bg-sky">
                <input type="checkbox" checked={chosen.includes(friend.id)} className="h-5 w-5 accent-bark"
                  onChange={(e) => setChosen(e.target.checked ? [...chosen, friend.id] : chosen.filter((x) => x !== friend.id))} />
                <Avatar person={friend} size="xs" />
                {friend.name}
              </label>
            </li>
          ))}
        </ul>
        {result && <Notice kind={result.kind}>{result.text}</Notice>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={send} disabled={busy || friends.length === 0}>{busy ? "Sending…" : "Send invitations"}</Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Dialog>
  );
}

function LeaveDialog({ group, onClose, onLeft }: { group: StGroup; onClose: () => void; onLeft: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = (group.members?.length ?? 0) <= 1;

  async function leave() {
    setBusy(true);
    setError(null);
    try {
      await screenTimeApi.leave(group.id);
      onLeft();
    } catch (err) {
      setError(err instanceof Error ? err.message : "You weren't removed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Leave ${group.name}?`} onClose={onClose}>
      <div className="space-y-3">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>You&apos;ll stop sharing your numbers with this group.</li>
          <li>The group will no longer see any of your numbers, including earlier days.</li>
          {last && <li><b>You&apos;re the last member, so the group will be deleted.</b></li>}
        </ul>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" onClick={leave} disabled={busy}>{busy ? "Leaving…" : "Leave group"}</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---------- Leaderboard ----------

function LeaderboardPanel({ group }: { group: StGroup }) {
  const [day, setDay] = useState(isoDay(group.timezone, -1));
  const { data, error, loading, reload } = useApi(() => screenTimeApi.leaderboard(group.id, day), [group.id, day]);

  return (
    <FrameCard>
      <section aria-labelledby="board-title" className="space-y-3 p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="board-title" className="text-2xl font-bold">Leaderboard</h2>
            <p className="text-sm">Who recorded the most screen time. Minutes per person.</p>
          </div>
          <Field label="Day" htmlFor="board-day">
            <input id="board-day" type="date" value={day} max={isoDay(group.timezone, 0)} min={isoDay(group.timezone, -90)}
              onChange={(e) => e.target.value && setDay(e.target.value)} className={`${inputClass} w-44`} />
          </Field>
        </div>
        {loading && <Loading label="Loading leaderboard…" />}
        {error && <ErrorBox message={error} onRetry={reload} />}
        {data && <LeaderboardRows board={data} />}
      </section>
    </FrameCard>
  );
}

function LeaderboardRows({ board }: { board: Leaderboard }) {
  const target = board.target_minutes;
  const inApp = board.metric === "in_app";
  return (
    <div className="space-y-4">
      <p className="text-sm">
        <b>{dayLabel(board.day)}</b> · {board.metric_label} · target {minutesLabel(target)} per person
      </p>
      {board.ranked.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-bark/30 px-4 py-6 text-center text-sm">
          {inApp ? "Nobody used Meetkat that day." : "Nobody has logged this day yet."}
        </p>
      ) : (
        <ol className="space-y-3">
          {board.ranked.map((row) => (
            <li key={row.person.id} className={`rounded-2xl p-3 ${row.is_me ? "bg-sky-strong" : "bg-cream"}`}>
              <div className="flex items-center gap-3">
                <span className="w-7 shrink-0 text-center text-xl font-extrabold" aria-label={`Rank ${row.rank}`}>{row.rank}</span>
                <Avatar person={row.person} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{row.is_me ? "You" : row.person.name}</p>
                  {row.rank === 1 && (
                    <p className="text-xs">Most screen time that day. Fancy a walk together instead?</p>
                  )}
                </div>
                <span className="shrink-0 text-right font-bold tabular-nums">{minutesLabel(row.minutes)}</span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-bark/15" role="progressbar" aria-valuemin={0}
                aria-valuemax={target} aria-valuenow={Math.min(row.minutes, target)}
                aria-label={`${row.is_me ? "Your" : `${row.person.name}'s`} screen time compared with the target`}>
                <div className={`h-full rounded-full ${row.over_target ? "bg-warning" : "bg-forest"}`}
                  style={{ width: `${Math.min(100, (row.minutes / target) * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs">
                {row.over_target
                  ? `${minutesLabel(row.difference_minutes)} over the target`
                  : row.difference_minutes === 0
                    ? "Right on the target"
                    : `${minutesLabel(-row.difference_minutes)} under the target`}
              </p>
            </li>
          ))}
        </ol>
      )}
      {board.no_entry.length > 0 && (
        <div className="rounded-xl bg-cream p-3 text-sm">
          <p className="font-semibold">{inApp ? "No time in Meetkat recorded:" : "No entry for this day:"}</p>
          <p>{board.no_entry.map((x) => (x.is_me ? "You" : x.person.name)).join(", ")}</p>
          <p className="mt-1 text-xs">Missing entries aren&apos;t counted as zero, so they&apos;re not ranked.</p>
          {!inApp && board.no_entry.some((x) => x.is_me) && (
            <Link href="/screen-time" className="mt-1 inline-block font-semibold underline">Log your screen time</Link>
          )}
        </div>
      )}
      <p className="text-xs">
        {board.updated_at
          ? `${inApp ? "Worked out" : "Last updated"} ${formatDateTime(board.updated_at)}. Unit: minutes.`
          : "No entries yet. Unit: minutes."}{" "}
        {inApp ? "Only time in Meetkat, not total phone use." : "Self-reported numbers aren't checked by Meetkat."}
      </p>
    </div>
  );
}
