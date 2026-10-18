"use client";

// Groups: the list (/groups) and one group's page (/groups?id=3).
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import { EventForm, GroupForm } from "@/components/CreateForms";
import Dialog from "@/components/Dialog";
import { ReportButton, ReportDialog } from "@/components/SafetyActions";
import { Empty, ErrorBox, Loading, Notice } from "@/components/States";
import { Button, Chip, DemoBadge, FrameCard, PageHeading, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { formatDateTime, timeAgo } from "@/lib/time";
import type { Group, MiniProfile } from "@/lib/types";
import { useApi } from "@/lib/useApi";

// JOIN! / JOINED ✓ button. Clicking JOINED asks to leave.
function JoinButton({ group, onChange, large = false }: { group: Group; onChange: (g: Group) => void; large?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      onChange(group.is_member ? await api.leaveGroup(group.id) : await api.joinGroup(group.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col items-stretch gap-1">
      <Button onClick={toggle} disabled={busy} aria-pressed={group.is_member}
        aria-label={group.is_member ? `Leave ${group.name}` : `Join ${group.name}`}
        variant={group.is_member ? "outline" : "dark"}
        className={large ? "min-w-40 py-3 text-2xl tracking-wider" : ""}>
        {busy ? "…" : group.is_member ? "JOINED ✓ · Leave" : "JOIN!"}
      </Button>
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}

function GroupList({ deleted }: { deleted: string | null }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState(false);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(q), 300);
    return () => clearTimeout(timer);
  }, [q]);
  const { data, error, loading, reload, setData } = useApi(() => api.groups({ q: query, mine }), [query, mine]);

  return (
    <div>
      {deleted !== null && (
        <div className="mb-4">
          <Notice kind="success">
            Group deleted.{" "}
            {Number(deleted) > 0
              ? `${deleted} ${Number(deleted) === 1 ? "member was" : "members were"} notified.`
              : "Nobody else needed to be notified."}
          </Notice>
        </div>
      )}
      <PageHeading title="Groups">
        <Button onClick={() => setCreating(true)}>+ Create group</Button>
      </PageHeading>
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl bg-cream p-4">
        <label className="min-w-56 flex-1 text-sm font-semibold">
          Search groups
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or description" className={`${inputClass} mt-1 font-normal`} />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="h-5 w-5 accent-pine" />
          Only my groups
        </label>
      </div>

      {loading && <Loading label="Loading groups…" />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && !loading && data.length === 0 && (
        <Empty title={mine ? "You haven't joined any groups yet" : "No groups found"}>
          <button className="font-semibold underline" onClick={() => setCreating(true)}>Create one</button>
        </Empty>
      )}
      <ul className="space-y-5">
        {data?.map((group) => (
          <li key={group.id}>
            <FrameCard>
              <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                <div className="min-w-0">
                  <Link href={`/groups?id=${group.id}`} className="text-2xl font-semibold tracking-wide underline-offset-4 hover:underline sm:text-3xl">
                    {group.name}
                  </Link>
                  {group.is_demo && <span className="ml-2 align-middle"><DemoBadge /></span>}
                  <p className="mt-1 text-lg">
                    {group.member_count} member{group.member_count === 1 ? "" : "s"}
                    {group.next_event_at && <> – next event {formatDateTime(group.next_event_at)}</>}
                  </p>
                  {group.description && <p className="mt-1 line-clamp-2 text-sm">{group.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">{group.tags.map((t) => <Chip key={t}>{t}</Chip>)}</div>
                </div>
                <JoinButton large group={group}
                  onChange={(g) => setData(data.map((x) => (x.id === g.id ? { ...x, ...g } : x)))} />
              </div>
            </FrameCard>
          </li>
        ))}
      </ul>

      {creating && (
        <Dialog title="Create a group" onClose={() => setCreating(false)}>
          <GroupForm onCreated={(g) => { setCreating(false); router.push(`/groups?id=${g.id}`); }} />
        </Dialog>
      )}
    </div>
  );
}

function Discussion({ groupId }: { groupId: number }) {
  const { data, error, loading, reload, setData } = useApi(() => api.groupPosts(groupId), [groupId], 15_000);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [reporting, setReporting] = useState<number | null>(null);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setSendError(null);
    try {
      const created = await api.createGroupPost(groupId, body.trim());
      setData([...(data ?? []), created]);
      setBody("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Your post wasn't saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="discussion-title" className="rounded-frame bg-pine p-5 text-cream sm:p-6">
      <h2 id="discussion-title" className="text-2xl font-bold">Discussion</h2>
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.length === 0 && <p className="mt-2 text-sm opacity-80">No posts yet. Start the conversation!</p>}
      <ul className="mt-3 space-y-3">
        {data?.map((p) => (
          <li key={p.id} className="flex gap-3">
            <Avatar person={p.author} size="sm" />
            <div className="min-w-0 rounded-2xl bg-cream px-4 py-2 text-pine">
              <p className="text-xs font-semibold">
                {p.mine ? "You" : p.author.name} · {timeAgo(p.created_at)}
                {!p.mine && <button type="button" onClick={() => setReporting(p.id)} className="ml-2 font-normal underline">Report</button>}
              </p>
              <p className="whitespace-pre-wrap break-words">{p.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={post} className="mt-4 flex gap-2">
        <label htmlFor="post" className="sr-only">Write a post</label>
        <input id="post" value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)}
          placeholder="Write something to the group…" className="min-h-11 flex-1 rounded-full bg-cream px-4 text-pine" />
        <Button type="submit" variant="light" disabled={busy || !body.trim()}>{busy ? "Posting…" : "Post"}</Button>
      </form>
      {sendError && <p role="alert" className="mt-2 rounded-lg bg-cream px-3 py-2 text-sm font-medium text-danger">{sendError}</p>}
      {reporting !== null && <ReportDialog targetType="group_post" targetId={reporting} onClose={() => setReporting(null)} />}
    </section>
  );
}

// The owner's Edit and Delete buttons. The server checks it's really the owner.
function OwnerActions({ group, onSaved }: { group: Group; onSaved: (g: Group) => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const others = group.member_count - (group.is_member ? 1 : 0);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.deleteGroup(group.id);
      router.push(`/groups?deleted=${result.notified}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the group.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => { setSaved(false); setEditing(true); }}>Edit group</Button>
        <Button variant="danger" onClick={() => { setTyped(""); setDeleting(true); }}>Delete group</Button>
      </div>
      {saved && <Notice kind="success">Group saved.</Notice>}
      {editing && (
        <Dialog title="Edit group" onClose={() => setEditing(false)}>
          <GroupForm existing={group} onCreated={(g) => { setEditing(false); setSaved(true); onSaved(g); }} />
        </Dialog>
      )}
      {deleting && (
        <Dialog title={`Delete “${group.name}”?`} onClose={() => setDeleting(false)}>
          <div className="space-y-3">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>The group and its discussion are deleted for everyone. This can&apos;t be undone.</li>
              <li>{others > 0 ? `The ${others} other ${others === 1 ? "member gets" : "members get"} a notification.` : "Nobody else is in it."}</li>
              <li>Its events stay, but no longer belong to a group.</li>
            </ul>
            <label className="block text-sm font-semibold" htmlFor="confirm-group-name">
              Type the group&apos;s name to confirm
            </label>
            <input id="confirm-group-name" value={typed} onChange={(e) => setTyped(e.target.value)} className={inputClass}
              autoComplete="off" placeholder={group.name} />
            {error && <Notice kind="error">{error}</Notice>}
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" onClick={remove} disabled={busy || typed.trim() !== group.name}>
                {busy ? "Deleting…" : "Delete forever"}
              </Button>
              <Button variant="outline" onClick={() => setDeleting(false)}>Cancel</Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

// Lets the owner remove someone. They aren't notified; groups are open, so they could join again.
function RemoveMemberButton({ group, member, onRemoved }: { group: Group; member: MiniProfile; onRemoved: (g: Group) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      onRemoved(await api.removeGroupMember(group.id, member.id));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove them.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Remove ${member.name} from the group`}
        className="min-h-9 rounded-full px-2 text-xs font-semibold text-danger underline">
        Remove
      </button>
      {open && (
        <Dialog title={`Remove ${member.name}?`} onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <p>They&apos;ll leave {group.name} and lose access to its discussion. They won&apos;t get a notification.</p>
            <p className="text-sm">Groups are open, so they could join again. If someone is making the group unsafe, block or report them too.</p>
            {error && <Notice kind="error">{error}</Notice>}
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" onClick={remove} disabled={busy}>{busy ? "Removing…" : "Remove"}</Button>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

function GroupDetail({ id }: { id: number }) {
  const router = useRouter();
  const me = useMe();
  const { data: group, error, loading, reload, setData } = useApi(() => api.group(id), [id]);
  const [planning, setPlanning] = useState(false);

  if (loading) return <Loading label="Loading group…" />;
  if (error || !group) {
    return (
      <div className="space-y-3">
        <ErrorBox message={error ?? "This group could not be found."} onRetry={reload} />
        <Link href="/groups" className="font-semibold underline">Back to groups</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link href="/groups" className="font-semibold underline">← All groups</Link>
      <FrameCard>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-7">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold sm:text-4xl">{group.name} {group.is_demo && <DemoBadge />}</h1>
            <p className="mt-1 text-lg">{group.member_count} member{group.member_count === 1 ? "" : "s"}{group.is_owner && " · you created this group"}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">{group.tags.map((t) => <Chip key={t}>{t}</Chip>)}</div>
            {group.description && <p className="mt-3 max-w-2xl whitespace-pre-line">{group.description}</p>}
            {group.is_owner
              ? <OwnerActions group={group} onSaved={setData} />
              : <ReportButton targetType="group" targetId={group.id} label="Report group" className="mt-3" />}
          </div>
          <JoinButton large group={group} onChange={(g) => setData(g)} />
        </div>
      </FrameCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-5">
          <section aria-labelledby="members-title" className="rounded-2xl bg-cream p-5">
            <h2 id="members-title" className="text-xl font-bold">Members</h2>
            <ul className="mt-3 flex flex-wrap gap-3">
              {group.members?.map((m) => (
                <li key={m.id} className="flex flex-col items-center">
                  <Link href={`/profile?id=${m.id}`} className="flex flex-col items-center gap-1 text-center text-xs">
                    <Avatar person={m} size="sm" />
                    <span className="max-w-20 truncate">{m.name.split(" ")[0]}</span>
                  </Link>
                  {group.is_owner && m.id !== me.id && <RemoveMemberButton group={group} member={m} onRemoved={setData} />}
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="events-title" className="rounded-2xl bg-cream p-5">
            <h2 id="events-title" className="text-xl font-bold">Upcoming events</h2>
            {group.events?.length ? (
              <ul className="mt-2 space-y-2">
                {group.events.map((e) => (
                  <li key={e.id}>
                    <Link href={`/events?id=${e.id}`} className="block rounded-xl bg-sage px-3 py-2 hover:brightness-95">
                      <span className="font-semibold">{e.title}</span>
                      <span className="block text-sm">{formatDateTime(e.starts_at)} · {e.going_count} going</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm">No upcoming events.</p>
            )}
            {group.is_member && (
              <Button className="mt-3" variant="outline" onClick={() => setPlanning(true)}>Plan an event for this group</Button>
            )}
          </section>
        </div>
        {group.is_member ? (
          <Discussion groupId={group.id} />
        ) : (
          <Empty title="Join to see the discussion">Members can read and write posts here.</Empty>
        )}
      </div>

      {planning && (
        <Dialog title={`Plan an event for ${group.name}`} onClose={() => setPlanning(false)}>
          <EventForm defaultGroupId={group.id} onCreated={(e) => { setPlanning(false); router.push(`/events?id=${e.id}`); }} />
        </Dialog>
      )}
    </div>
  );
}

function GroupsContent() {
  const params = useSearchParams();
  const id = params.get("id");
  return id ? <GroupDetail id={Number(id)} /> : <GroupList deleted={params.get("deleted")} />;
}

export default function GroupsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <GroupsContent />
    </Suspense>
  );
}
