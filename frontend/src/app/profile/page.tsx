"use client";

// Profile: yours (/profile) or someone else's (/profile?id=5).
// Two views of the same data: "Info view" and "Expressive view".
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Dialog from "@/components/Dialog";
import FriendButton from "@/components/FriendButton";
import MatchInsight from "@/components/MatchInsight";
import ProfileForm from "@/components/ProfileForm";
import { AvailabilityGrid } from "@/components/ProfileInputs";
import { BlockButton, ReportButton } from "@/components/SafetyActions";
import VerificationBadges from "@/components/VerificationBadges";
import { ProfileExpressive, ProfileInfo, ViewToggle } from "@/components/ProfileViews";
import { ErrorBox, Loading, Notice } from "@/components/States";
import { Button, FrameCard } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { useOptions } from "@/lib/options";
import type { Person } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type View = "info" | "expressive";
const VIEW_KEY = "ff_profile_view";

// Remembers which view you like, in this browser.
function useView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>("info");
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "expressive") setView("expressive");
    } catch {}
  }, []);
  return [
    view,
    (v) => {
      setView(v);
      try {
        localStorage.setItem(VIEW_KEY, v);
      } catch {}
    },
  ];
}

function OwnProfile({ startEditing }: { startEditing: boolean }) {
  const me = useMe();
  const router = useRouter();
  const { options } = useOptions();
  const [view, setView] = useView();
  const [editing, setEditing] = useState(startEditing);
  const [saved, setSaved] = useState(false);

  // The + menu's "Edit my profile" also works when you're already on this page.
  useEffect(() => {
    if (startEditing) setEditing(true);
  }, [startEditing]);

  function stopEditing() {
    setEditing(false);
    router.replace("/profile");
  }

  if (editing) {
    return (
      <div>
        <h1 className="mb-4 text-3xl font-bold">Edit your profile</h1>
        <FrameCard>
          <div className="p-5 sm:p-7">
            <ProfileForm profile={me} mode="edit" onCancel={stopEditing}
              onSaved={() => { stopEditing(); setSaved(true); }} />
          </div>
        </FrameCard>
      </div>
    );
  }

  const actions = <Button onClick={() => { setSaved(false); setEditing(true); }}>Edit Profile</Button>;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewToggle view={view} onChange={setView} />
        <p className="text-sm">This is how other people see you.</p>
      </div>
      {saved && <Notice kind="success">Profile saved.</Notice>}
      {view === "info" ? <ProfileInfo person={me} actions={actions} /> : <ProfileExpressive person={me} actions={actions} />}
      <Link href={`/memories?author_id=${me.id}`} className="inline-block font-semibold underline">📸 Your memories</Link>
      {options && (
        <section className="rounded-2xl bg-cream p-5" aria-labelledby="free-title">
          <h2 id="free-title" className="text-lg font-bold">When you&apos;re free</h2>
          <p className="mb-2 text-sm">Only you see this whole grid. Others only see the times you&apos;re both free.</p>
          <AvailabilityGrid days={options.days} slots={options.slots} value={me.availability} />
        </section>
      )}
    </div>
  );
}

function OtherProfile({ id }: { id: number }) {
  const router = useRouter();
  const { options } = useOptions();
  const [view, setView] = useView();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const { data: person, error, loading, reload, setData } = useApi(() => api.person(id), [id]);

  if (loading) return <Loading label="Loading profile…" />;
  if (error || !person) {
    return (
      <div className="space-y-3">
        <ErrorBox message={error ?? "This person could not be found."} onRetry={reload} />
        <Link href="/feed" className="font-semibold underline">Back to Discover</Link>
      </div>
    );
  }

  const setRelationship = (relationship: Person["relationship"]) => setData({ ...person, relationship });

  async function remove() {
    setRemoveError(null);
    try {
      await api.removeFriend(person!.id);
      setConfirmRemove(false);
      setRelationship({ status: "none", request_id: null });
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "Couldn't remove this friend.");
    }
  }

  const actions = (
    <div className="flex flex-wrap items-start gap-2">
      <FriendButton personId={person.id} personName={person.name} relationship={person.relationship} onChange={setRelationship} />
      {person.relationship.status === "friends" && (
        <Button variant="danger" onClick={() => setConfirmRemove(true)}>Remove friend</Button>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/feed" className="font-semibold underline">← Discover</Link>
        <ViewToggle view={view} onChange={setView} />
      </div>
      {view === "info" ? (
        <ProfileInfo person={person} actions={actions} sharedInterests={person.match.shared_interests} />
      ) : (
        <ProfileExpressive person={person} actions={actions} />
      )}
      <Link href={`/memories?author_id=${person.id}`} className="inline-block font-semibold underline">
        📸 Memories {person.name.split(" ")[0]} shared with you
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
        <VerificationBadges badges={person.badges} />
        <div className="flex flex-wrap gap-2">
          <ReportButton targetType="profile" targetId={person.id} label="Report profile" />
          <BlockButton userId={person.id} name={person.name} onBlocked={() => router.push("/feed")} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-2xl bg-cream p-5" aria-labelledby="match-title">
          <h2 id="match-title" className="text-xl font-bold">{person.match.score}% match</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {person.match.reasons.length ? person.match.reasons.map((r) => <li key={r}>{r}</li>) : <li>Nothing in common on paper yet.</li>}
          </ul>
          {options && person.match.overlap.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-sm font-semibold">Times you&apos;re both free</p>
              <AvailabilityGrid days={options.days} slots={options.slots} value={{}} highlight={person.match.overlap} />
            </div>
          )}
        </section>
        <MatchInsight personId={person.id} />
      </div>

      {confirmRemove && (
        <Dialog title={`Remove ${person.name}?`} onClose={() => setConfirmRemove(false)}>
          <p>You won&apos;t be friends anymore and won&apos;t be able to message each other. They aren&apos;t notified.</p>
          {removeError && <div className="mt-3"><ErrorBox message={removeError} /></div>}
          <div className="mt-5 flex gap-2">
            <Button variant="danger" onClick={remove}>Remove friend</Button>
            <Button variant="outline" onClick={() => setConfirmRemove(false)}>Cancel</Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function ProfileContent() {
  const params = useSearchParams();
  const me = useMe();
  const id = Number(params.get("id") ?? me.id);
  if (!Number.isInteger(id) || id === me.id) return <OwnProfile startEditing={params.get("edit") === "1"} />;
  return <OtherProfile id={id} />;
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<Loading />}>
      <ProfileContent />
    </Suspense>
  );
}
