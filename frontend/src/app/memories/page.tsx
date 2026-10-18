"use client";

// Memories: moments you share with your mob. This is separate from Discover (finding people).
//   /memories               your feed: memories you're allowed to see, newest first
//   /memories?id=12         one memory (notifications link here)
//   /memories?author_id=5   one person's memories
// Who can see each memory is decided by the server (backend/app/memories.py), not by this page.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import Dialog from "@/components/Dialog";
import { photoToJpeg } from "@/components/ProfileInputs";
import { ReportButton } from "@/components/SafetyActions";
import { Empty, ErrorBox, Loading, Notice } from "@/components/States";
import { Button, DemoBadge, Field, FrameCard, PageHeading, inputClass } from "@/components/ui";
import { useMe } from "@/lib/auth";
import {
  AUDIENCES,
  MAX_PHOTOS,
  createMemory,
  memoriesApi,
  type Memory,
  type MemoryAudience,
  type MemoryComment,
} from "@/lib/memories";
import { formatDateTime, timeAgo } from "@/lib/time";
import { useApi } from "@/lib/useApi";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // same limit as the server (after converting to JPEG)

function audienceLabel(audience: MemoryAudience) {
  return AUDIENCES.find((a) => a.value === audience)?.label ?? audience;
}

// Roughly how many bytes a "data:image/jpeg;base64,..." photo will be once decoded.
function dataUrlBytes(dataUrl: string) {
  return Math.floor(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);
}

function AudienceSelect({ id, value, onChange }: { id: string; value: MemoryAudience; onChange: (a: MemoryAudience) => void }) {
  return (
    <Field label="Who can see this?" htmlFor={id} hint={AUDIENCES.find((a) => a.value === value)?.hint}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as MemoryAudience)} className={inputClass}>
        {AUDIENCES.map((a) => (
          <option key={a.value} value={a.value}>{a.label}</option>
        ))}
      </select>
    </Field>
  );
}

// ---------- Posting ----------

function Composer({ onPosted }: { onPosted: (memory: Memory) => void }) {
  const [caption, setCaption] = useState("");
  const [audience, setAudience] = useState<MemoryAudience>("friends");
  const [photos, setPhotos] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function addPhotos(files: FileList | null) {
    setError(null);
    if (!files?.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) setError(`You can add up to ${MAX_PHOTOS} photos to one memory.`);
    const added: string[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      try {
        const jpeg = await photoToJpeg(file);
        if (dataUrlBytes(jpeg) > MAX_PHOTO_BYTES) setError("One photo is still over 2 MB, so it was left out.");
        else added.push(jpeg);
      } catch (err) {
        setError(err instanceof Error ? err.message : "That photo couldn't be read.");
      }
    }
    setPhotos((current) => [...current, ...added].slice(0, MAX_PHOTOS));
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPosted(false);
    if (!caption.trim() && photos.length === 0) {
      setError("Add a caption or at least one photo.");
      return;
    }
    setProgress(0);
    try {
      const memory = await createMemory({ caption: caption.trim(), audience, photos }, setProgress);
      onPosted(memory);
      setCaption("");
      setPhotos([]);
      setPosted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your memory wasn't posted.");
    } finally {
      setProgress(null);
    }
  }

  const busy = progress !== null;
  return (
    <FrameCard>
      <form onSubmit={submit} className="space-y-3 p-4 sm:p-5" aria-labelledby="composer-title">
        <h2 id="composer-title" className="text-xl font-bold">Share a memory</h2>
        <Field label="Caption" htmlFor="memory-caption">
          <textarea id="memory-caption" rows={3} maxLength={1000} value={caption}
            onChange={(e) => setCaption(e.target.value)} placeholder="What happened?" className={inputClass} />
        </Field>
        <AudienceSelect id="memory-audience" value={audience} onChange={setAudience} />

        <div>
          <p className="text-sm font-semibold">Photos (up to {MAX_PHOTOS})</p>
          {photos.length > 0 && (
            <ul className="mt-2 grid grid-cols-4 gap-2">
              {photos.map((photo, i) => (
                <li key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt={`Photo ${i + 1} you're adding`} className="aspect-square w-full rounded-lg object-cover" />
                  <button type="button" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} disabled={busy}
                    aria-label={`Remove photo ${i + 1}`}
                    className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-pine/80 text-cream">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {photos.length < MAX_PHOTOS && (
            <label className="mt-2 inline-flex min-h-11 cursor-pointer items-center rounded-xl border-2 border-pine px-4 font-semibold hover:bg-cream">
              + Add photos
              <input ref={fileInput} type="file" accept="image/*" multiple className="sr-only" disabled={busy}
                onChange={(e) => addPhotos(e.target.files)} />
            </label>
          )}
          <p className="mt-1 text-xs opacity-80">
            Camera and location details are removed from photos. Nobody is tagged automatically.
          </p>
        </div>

        {busy && (
          <div>
            <div className="h-3 overflow-hidden rounded-full bg-cream" role="progressbar" aria-valuemin={0} aria-valuemax={100}
              aria-valuenow={progress} aria-label="Upload progress">
              <div className="h-full rounded-full bg-forest transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-sm" aria-live="polite">{progress! < 100 ? `Uploading… ${progress}%` : "Saving…"}</p>
          </div>
        )}
        {error && <Notice kind="error">{error}</Notice>}
        {posted && !busy && <Notice kind="success">Posted.</Notice>}
        <Button type="submit" disabled={busy}>{busy ? "Posting…" : "Post memory"}</Button>
      </form>
    </FrameCard>
  );
}

// ---------- One memory ----------

function PhotoGrid({ memory }: { memory: Memory }) {
  if (memory.photos.length === 0) return null;
  const single = memory.photos.length === 1;
  return (
    <div className={`mt-3 grid gap-1 overflow-hidden rounded-xl ${single ? "grid-cols-1" : "grid-cols-2"}`}>
      {memory.photos.map((photo, i) => (
        <a key={photo.url} href={photo.url} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt={`Photo ${i + 1} shared by ${memory.author.name}`} loading="lazy"
            className={`w-full bg-sage object-cover ${single ? "max-h-[28rem]" : "aspect-square"}`} />
        </a>
      ))}
    </div>
  );
}

function Comments({ memory, onCountChange }: { memory: Memory; onCountChange: (n: number) => void }) {
  const { data, error, loading, reload, setData } = useApi(() => memoriesApi.comments(memory.id), [memory.id]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setSendError(null);
    try {
      const comment = await memoriesApi.addComment(memory.id, body.trim());
      const next = [...(data ?? []), comment];
      setData(next);
      onCountChange(next.length);
      setBody("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Your comment wasn't posted.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(comment: MemoryComment) {
    try {
      await memoriesApi.deleteComment(memory.id, comment.id);
      const next = (data ?? []).filter((c) => c.id !== comment.id);
      setData(next);
      onCountChange(next.length);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "That comment wasn't deleted.");
    }
  }

  return (
    <div className="mt-3 rounded-xl bg-cream p-3">
      {loading && <Loading label="Loading comments…" />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.length === 0 && <p className="text-sm opacity-80">No comments yet.</p>}
      <ul className="space-y-2">
        {data?.map((c) => (
          <li key={c.id} className="flex gap-2">
            <Avatar person={c.author} size="xs" />
            <div className="min-w-0 flex-1">
              <p className="text-xs">
                <b>{c.mine ? "You" : c.author.name}</b> · <span title={formatDateTime(c.created_at)}>{timeAgo(c.created_at)}</span>
              </p>
              <p className="whitespace-pre-wrap break-words">{c.body}</p>
            </div>
            {c.can_delete && (
              <button type="button" onClick={() => remove(c)} className="min-h-9 shrink-0 self-start rounded-lg px-2 text-sm underline"
                aria-label={`Delete comment by ${c.mine ? "you" : c.author.name}`}>
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <label htmlFor={`comment-${memory.id}`} className="sr-only">Write a comment</label>
        <input id={`comment-${memory.id}`} value={body} maxLength={500} onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment…" className={`${inputClass} min-w-0 flex-1`} />
        <Button type="submit" disabled={busy || !body.trim()}>{busy ? "…" : "Post"}</Button>
      </form>
      {sendError && <div className="mt-2"><Notice kind="error">{sendError}</Notice></div>}
    </div>
  );
}

function EditDialog({ memory, onClose, onSaved }: { memory: Memory; onClose: () => void; onSaved: (m: Memory) => void }) {
  const [caption, setCaption] = useState(memory.caption);
  const [audience, setAudience] = useState(memory.audience);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await memoriesApi.update(memory.id, { caption: caption.trim(), audience }));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your changes weren't saved.");
      setBusy(false);
    }
  }

  return (
    <Dialog title="Edit memory" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <Field label="Caption" htmlFor={`edit-caption-${memory.id}`}>
          <textarea id={`edit-caption-${memory.id}`} rows={4} maxLength={1000} value={caption}
            onChange={(e) => setCaption(e.target.value)} className={inputClass} />
        </Field>
        <AudienceSelect id={`edit-audience-${memory.id}`} value={audience} onChange={setAudience} />
        <p className="text-xs opacity-80">
          Photo links already open in someone&apos;s browser can keep working for up to an hour after you change who can see this.
        </p>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteDialog({ memory, onClose, onDeleted }: { memory: Memory; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await memoriesApi.remove(memory.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "This memory wasn't deleted.");
      setBusy(false);
    }
  }

  return (
    <Dialog title="Delete this memory?" onClose={onClose}>
      <p>Its photos, ❤️s and comments are deleted too. This can&apos;t be undone.</p>
      <p className="mt-1 text-sm opacity-80">Copies other people already saved or screenshotted are outside Meerkat&apos;s control.</p>
      {error && <div className="mt-2"><Notice kind="error">{error}</Notice></div>}
      <div className="mt-4 flex gap-2">
        <Button variant="danger" onClick={confirm} disabled={busy}>{busy ? "Deleting…" : "Delete forever"}</Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </Dialog>
  );
}

function MemoryCard({ memory, onChange, onDeleted }: {
  memory: Memory;
  onChange: (m: Memory) => void;
  onDeleted: () => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleReaction() {
    setError(null);
    try {
      const state = memory.reacted_by_me ? await memoriesApi.unreact(memory.id) : await memoriesApi.react(memory.id);
      onChange({ ...memory, ...state });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Please try again.");
    }
  }

  return (
    <article className="rounded-frame bg-forest p-2.5" aria-labelledby={`memory-${memory.id}-by`}>
      <div className="rounded-inner bg-sage p-4 sm:p-5">
        <header className="flex items-start gap-3">
          <Avatar person={memory.author} size="sm" />
          <div className="min-w-0 flex-1">
            <p id={`memory-${memory.id}-by`} className="flex flex-wrap items-center gap-x-2 font-semibold">
              <Link href={`/profile?id=${memory.author.id}`} className="underline-offset-4 hover:underline">
                {memory.mine ? "You" : memory.author.name}
              </Link>
              {memory.author.is_demo && <DemoBadge />}
            </p>
            <p className="text-xs">
              <time dateTime={memory.created_at} title={formatDateTime(memory.created_at)}>{timeAgo(memory.created_at)}</time>
              {" · "}
              {audienceLabel(memory.audience)}
              {memory.edited && <span title={`Edited ${formatDateTime(memory.updated_at)}`}> · edited</span>}
            </p>
          </div>
        </header>

        {memory.caption && <p className="mt-3 whitespace-pre-wrap break-words text-lg">{memory.caption}</p>}
        <PhotoGrid memory={memory} />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant={memory.reacted_by_me ? "dark" : "outline"} onClick={toggleReaction} aria-pressed={memory.reacted_by_me}
            aria-label={memory.reacted_by_me ? "Remove your heart" : "Add a heart"} className="min-h-10 px-3">
            ❤️ {memory.reaction_count}
          </Button>
          <Button variant="outline" onClick={() => setShowComments(!showComments)} aria-expanded={showComments}
            className="min-h-10 px-3">
            💬 {memory.comment_count} {memory.comment_count === 1 ? "comment" : "comments"}
          </Button>
          <div className="ml-auto flex flex-wrap gap-2">
            {memory.mine ? (
              <>
                <Button variant="outline" onClick={() => setEditing(true)} className="min-h-10 px-3 text-sm">Edit</Button>
                <Button variant="danger" onClick={() => setDeleting(true)} className="min-h-10 px-3 text-sm">Delete</Button>
              </>
            ) : (
              <ReportButton targetType="memory" targetId={memory.id} />
            )}
          </div>
        </div>
        {error && <div className="mt-2"><Notice kind="error">{error}</Notice></div>}
        {showComments && <Comments memory={memory} onCountChange={(n) => onChange({ ...memory, comment_count: n })} />}
      </div>
      {editing && <EditDialog memory={memory} onClose={() => setEditing(false)} onSaved={onChange} />}
      {deleting && <DeleteDialog memory={memory} onClose={() => setDeleting(false)} onDeleted={onDeleted} />}
    </article>
  );
}

// ---------- Pages ----------

function Feed({ authorId }: { authorId?: number }) {
  const me = useMe();
  const { data, error, loading, reload, setData } = useApi(() => memoriesApi.list({ author_id: authorId }), [authorId]);
  const [more, setMore] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const showComposer = !authorId || authorId === me.id;
  const memories = data?.memories ?? [];

  const replace = (m: Memory) => data && setData({ ...data, memories: memories.map((x) => (x.id === m.id ? m : x)) });
  const drop = (id: number) => data && setData({ ...data, memories: memories.filter((x) => x.id !== id) });

  async function loadMore() {
    if (!data?.next_before_id) return;
    setMore({ busy: true, error: null });
    try {
      const page = await memoriesApi.list({ author_id: authorId, before_id: data.next_before_id });
      setData({ memories: [...memories, ...page.memories], next_before_id: page.next_before_id });
      setMore({ busy: false, error: null });
    } catch (err) {
      setMore({ busy: false, error: err instanceof Error ? err.message : "Couldn't load more." });
    }
  }

  const authorName = authorId && authorId !== me.id ? memories[0]?.author.name : null;
  return (
    <div className="space-y-5">
      {authorId ? (
        <p>
          <Link href="/memories" className="font-semibold underline">← All memories</Link>
          {authorId === me.id ? " · Your memories" : authorName ? ` · Memories by ${authorName}` : ""}
        </p>
      ) : null}
      {showComposer && (
        <Composer onPosted={(m) => setData({ memories: [m, ...memories], next_before_id: data?.next_before_id ?? null })} />
      )}
      {loading && <Loading label="Loading memories…" />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && memories.length === 0 && (
        <Empty title="No memories yet">
          {authorId && authorId !== me.id
            ? "Nothing here that you're allowed to see."
            : "Share a moment with your friends, or add friends to see theirs."}
        </Empty>
      )}
      <div className="space-y-5">
        {memories.map((m) => (
          <MemoryCard key={m.id} memory={m} onChange={replace} onDeleted={() => drop(m.id)} />
        ))}
      </div>
      {data?.next_before_id && (
        <div className="text-center">
          <Button variant="outline" onClick={loadMore} disabled={more.busy}>{more.busy ? "Loading…" : "Load more"}</Button>
        </div>
      )}
      {more.error && <Notice kind="error">{more.error}</Notice>}
    </div>
  );
}

function SingleMemory({ id }: { id: number }) {
  const { data, error, loading, reload, setData } = useApi(() => memoriesApi.get(id), [id]);
  const [deleted, setDeleted] = useState(false);
  return (
    <div className="space-y-4">
      <Link href="/memories" className="font-semibold underline">← All memories</Link>
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {deleted && <Notice kind="success">Deleted.</Notice>}
      {data && !deleted && <MemoryCard memory={data} onChange={setData} onDeleted={() => setDeleted(true)} />}
    </div>
  );
}

function MemoriesContent() {
  const params = useSearchParams();
  const id = Number(params.get("id")) || 0;
  const authorId = Number(params.get("author_id")) || undefined;
  return (
    // A narrower column, like most feeds, so photos don't get huge on wide screens.
    <div className="max-w-2xl">
      <PageHeading title="Memories" />
      <p className="-mt-3 mb-5 max-w-2xl">
        Moments shared with your mob. This is separate from Discover: here you only see memories people chose to share
        with you.
      </p>
      {id ? <SingleMemory id={id} /> : <Feed authorId={authorId} />}
    </div>
  );
}

export default function MemoriesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <MemoriesContent />
    </Suspense>
  );
}
