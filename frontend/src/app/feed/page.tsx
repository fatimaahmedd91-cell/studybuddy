"use client";

// Feed / Discover: people ranked by how well you match, with filters and the reasons for each match.
import Link from "next/link";
import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import FriendButton from "@/components/FriendButton";
import { Empty, ErrorBox, Loading } from "@/components/States";
import { Button, Chip, DemoBadge, FrameCard, PageHeading, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { useOptions } from "@/lib/options";
import type { Person } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type Filters = { q: string; university: string; interest: string; goal: string; free_together: boolean };
const NO_FILTERS: Filters = { q: "", university: "", interest: "", goal: "", free_together: false };

function PersonCard({ person, onRelationship }: { person: Person; onRelationship: (p: Person) => void }) {
  const shared = new Set(person.match.shared_interests.map((i) => i.toLowerCase()));
  return (
    <FrameCard>
      <article className="flex flex-col gap-5 p-4 sm:p-5 md:flex-row md:items-start">
        <Link href={`/profile?id=${person.id}`} className="flex shrink-0 flex-col items-center gap-2 text-center md:w-52">
          <Avatar person={person} size="lg" />
          <span className="flex items-center gap-2 text-lg font-bold">
            {person.name} {person.is_demo && <DemoBadge />}
          </span>
          <span className="text-sm">{[person.pronouns, person.age].filter(Boolean).join(" · ")}</span>
          <span className="text-sm font-medium">🎓 {person.university}</span>
        </Link>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-pine px-3 py-1 text-lg font-bold text-cream">{person.match.score}% match</span>
            {person.hook && <span className="italic">&ldquo;{person.hook}&rdquo;</span>}
          </div>
          {person.match.reasons.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-5 text-sm">
              {person.match.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          ) : (
            <p className="text-sm">Nothing in common on paper yet. A new perspective can still make a great friend.</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {person.interests.map((i) => <Chip key={i} strong={shared.has(i.toLowerCase())}>{i}</Chip>)}
          </div>
          <div className="flex flex-wrap items-start gap-2 pt-1">
            <FriendButton compact personId={person.id} personName={person.name} relationship={person.relationship}
              onChange={(relationship) => onRelationship({ ...person, relationship })} />
            <Link href={`/profile?id=${person.id}`} className="inline-flex min-h-11 items-center rounded-xl border-2 border-pine px-4 font-semibold hover:bg-cream">
              View profile
            </Link>
          </div>
        </div>
      </article>
    </FrameCard>
  );
}

export default function FeedPage() {
  const me = useMe();
  const { options } = useOptions();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [search, setSearch] = useState("");

  // Wait until typing stops for a moment before searching by name.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => ({ ...f, q: search })), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, error, loading, reload, setData } = useApi(() => api.people(filters), [JSON.stringify(filters)]);
  const interests = [...new Set([...me.interests, ...(options?.suggested_interests ?? [])])];
  const active = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  function update(person: Person) {
    if (data) setData({ ...data, people: data.people.map((p) => (p.id === person.id ? person : p)) });
  }

  return (
    <div>
      <PageHeading title="Discover" />
      <form className="mb-6 grid gap-3 rounded-2xl bg-cream p-4 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(e) => e.preventDefault()}
        aria-label="Filter people">
        <label className="text-sm font-semibold lg:col-span-1">
          Name
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" className={`${inputClass} mt-1 font-normal`} />
        </label>
        <label className="text-sm font-semibold">
          University
          <select value={filters.university} onChange={(e) => setFilters({ ...filters, university: e.target.value })} className={`${inputClass} mt-1 font-normal`}>
            <option value="">Any university</option>
            {me.university && <option value={me.university}>Mine ({me.university})</option>}
            {(data?.universities ?? []).filter((u) => u !== me.university).map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Interest
          <select value={filters.interest} onChange={(e) => setFilters({ ...filters, interest: e.target.value })} className={`${inputClass} mt-1 font-normal`}>
            <option value="">Any interest</option>
            {interests.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Looking for
          <select value={filters.goal} onChange={(e) => setFilters({ ...filters, goal: e.target.value })} className={`${inputClass} mt-1 font-normal`}>
            <option value="">Anything</option>
            {(options?.friendship_goals ?? []).map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <div className="flex flex-col justify-end gap-2">
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={filters.free_together}
              onChange={(e) => setFilters({ ...filters, free_together: e.target.checked })} className="h-5 w-5 accent-pine" />
            Free when I&apos;m free
          </label>
          {active && (
            <Button type="button" variant="outline" className="min-h-9" onClick={() => { setSearch(""); setFilters(NO_FILTERS); }}>
              Clear filters
            </Button>
          )}
        </div>
      </form>

      {loading && <Loading label="Finding people…" />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && !loading && (
        <>
          <p className="mb-3 text-sm" role="status">
            {data.people.length} {data.people.length === 1 ? "person" : "people"}, best match first. Scores come from
            shared interests, friendship goals, university, and free time.
          </p>
          {data.people.length === 0 ? (
            <Empty title={active ? "Nobody matches these filters" : "No one else is here yet"}>
              {active ? "Try clearing a filter." : "Invite friends to sign up, or try again later."}
            </Empty>
          ) : (
            <div className="space-y-5">
              {data.people.map((person) => <PersonCard key={person.id} person={person} onRelationship={update} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
