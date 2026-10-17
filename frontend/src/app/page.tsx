"use client";

// Home: your profile, like the first page of the design.
import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar, DarkButton, OrangeCard, PageTitle, PostTile } from "@/components/ui";
import { handle, students } from "@/lib/data";
import { friendsOf } from "@/lib/matching";
import { type ProfileEdits, useStore } from "@/lib/store";

function EditProfileForm({ onDone }: { onDone: () => void }) {
  const { me, updateProfile } = useStore();
  const [form, setForm] = useState<ProfileEdits>({
    name: me.name,
    pronouns: me.pronouns,
    uni: me.uni,
    hook: me.hook,
  });
  const fields: [keyof ProfileEdits, string, number][] = [
    ["name", "Name", 60],
    ["pronouns", "Pronouns", 20],
    ["uni", "School", 60],
    ["hook", "Short hook", 100],
  ];

  function save(e: React.FormEvent) {
    e.preventDefault();
    updateProfile(form);
    onDone();
  }

  return (
    <form onSubmit={save} className="mt-4 grid gap-3 rounded-2xl border-2 border-bark bg-paper p-4 sm:grid-cols-2">
      {fields.map(([key, label, max]) => (
        <label key={key} className="text-sm font-medium">
          {label}
          <input
            value={form[key] ?? ""}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            maxLength={max}
            required={key === "name"}
            className="mt-1 w-full rounded-lg border-2 border-bark/30 bg-white/60 px-3 py-2 font-normal"
          />
        </label>
      ))}
      <div className="flex gap-2 sm:col-span-2">
        <DarkButton type="submit">Save</DarkButton>
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2 font-medium hover:bg-card">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function HomePage() {
  const { me, postsBy, account, ready } = useStore();
  const [editing, setEditing] = useState(false);
  const friends = useMemo(() => friendsOf(me, students), [me]);
  const posts = postsBy(me.id);

  return (
    <div className={ready ? "" : "opacity-0"}>
      <PageTitle>Your profile</PageTitle>

      {!account && (
        <p className="mb-4 rounded-xl bg-paper px-4 py-3 text-sm">
          You are exploring as a demo student.{" "}
          <Link href="/signup" className="font-semibold underline">
            Sign up
          </Link>{" "}
          or{" "}
          <Link href="/login" className="font-semibold underline">
            log in
          </Link>{" "}
          to use your own name.
        </p>
      )}

      <section className="flex flex-col items-center gap-6 py-4 sm:flex-row sm:gap-12 sm:px-8">
        <Avatar student={me} size="xl" />
        <div className="text-center sm:text-left">
          <p className="text-2xl tracking-wide sm:text-3xl">
            @{handle(me.name)} <span className="text-lg opacity-80 sm:text-xl">- {me.uni}</span>
          </p>
          <p className="mt-1 text-lg">
            {me.name} <span className="ml-2 opacity-70">{me.pronouns}</span>
          </p>
          <p className="mt-1">
            <b>{posts.length}</b> posts <span className="mx-3" /> <b>{friends.length}</b> friends
          </p>
          <p className="mt-2 italic">&ldquo;{me.hook}&rdquo;</p>
          <button
            onClick={() => setEditing(!editing)}
            className="mt-4 rounded-md border-2 border-bark px-6 py-1.5 font-medium hover:bg-paper"
          >
            Edit Profile
          </button>
        </div>
      </section>

      {editing && <EditProfileForm onDone={() => setEditing(false)} />}

      <OrangeCard className="mt-6">
        <div className="p-4 sm:p-6">
          <h2 className="mb-4 text-xl font-semibold">Your posts</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {posts.map((post) => (
              <PostTile key={post.id} post={post} color={me.color} className="w-full" />
            ))}
          </div>
        </div>
      </OrangeCard>
    </div>
  );
}
