// Two ways to show the same profile:
//   ProfileInfo        the information view (big photo top-left, name beside it, details below)
//   ProfileExpressive  the expressive view (big centred photo, hook front and centre)
// Both read the same profile data, so editing your profile changes both.
import type { PublicProfile } from "@/lib/types";
import Avatar from "./Avatar";
import { Chip, DemoBadge, FrameCard } from "./ui";

// Stickers are picked from the person's interests. Edit this list to add more.
function subtitle(person: PublicProfile) {
  return [person.pronouns, person.age ? `${person.age}` : ""].filter(Boolean).join(" · ");
}

export function ProfileInfo({
  person,
  actions,
  sharedInterests = [],
}: {
  person: PublicProfile;
  actions?: React.ReactNode;
  sharedInterests?: string[];
}) {
  const shared = new Set(sharedInterests.map((i) => i.toLowerCase()));
  return (
    <FrameCard>
      <div className="space-y-6 p-5 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-10">
          <Avatar person={person} size="xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold break-words sm:text-4xl">{person.name}</h1>
              {person.is_demo && <DemoBadge />}
            </div>
            {subtitle(person) && <p className="text-lg">{subtitle(person)}</p>}
            {person.hook && <p className="text-lg italic">&ldquo;{person.hook}&rdquo;</p>}
            {person.university && (
              <p className="font-medium">
                {person.university}
              </p>
            )}
            {actions && <div className="flex flex-wrap gap-2 pt-2">{actions}</div>}
          </div>
        </div>

        <section aria-labelledby="looking-for">
          <h2 id="looking-for" className="text-lg font-bold">Looking for…</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {person.looking_for.length ? person.looking_for.map((g) => <Chip key={g} strong>{g}</Chip>) : <p className="text-sm">Not set yet.</p>}
          </div>
        </section>

        <section aria-labelledby="about">
          <h2 id="about" className="text-lg font-bold">About</h2>
          <p className="mt-1 whitespace-pre-line">{person.bio || "No bio yet."}</p>
        </section>

        <section aria-labelledby="interests">
          <h2 id="interests" className="text-lg font-bold">Interests</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {person.interests.map((i) => (
              <Chip key={i} strong={shared.has(i.toLowerCase())}>
                {shared.has(i.toLowerCase()) ? "✓ " : ""}
                {i}
              </Chip>
            ))}
          </div>
          {sharedInterests.length > 0 && <p className="mt-2 text-xs opacity-75">✓ = an interest you share</p>}
        </section>
      </div>
    </FrameCard>
  );
}

export function ProfileExpressive({ person, actions }: { person: PublicProfile; actions?: React.ReactNode }) {
  return (
    <FrameCard inner="bg-cream">
      <div className="flex flex-col items-center px-5 pb-8 pt-10 text-center sm:px-10">
        <Avatar person={person} size="xl" />
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <h1 className="text-4xl font-bold sm:text-5xl">{person.name}</h1>
          {person.is_demo && <DemoBadge />}
        </div>
        {subtitle(person) && <p className="mt-2 text-xl">{subtitle(person)}</p>}
        {person.hook && (
          <p className="mt-5 max-w-xl rounded-2xl bg-bark px-6 py-4 text-2xl font-bold text-cream sm:text-3xl">
            &ldquo;{person.hook}&rdquo;
          </p>
        )}
        {person.university && <p className="mt-4 font-medium">{person.university}</p>}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {person.interests.map((i) => (
            <span key={i} className="inline-block rounded-full bg-sky px-3 py-1 text-sm font-semibold">{i}</span>
          ))}
        </div>
        {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
      </div>
    </FrameCard>
  );
}

export function ViewToggle({ view, onChange }: { view: "info" | "expressive"; onChange: (v: "info" | "expressive") => void }) {
  return (
    <div role="group" aria-label="Profile view" className="inline-flex rounded-xl border-2 border-bark p-1">
      {(["info", "expressive"] as const).map((v) => (
        <button
          key={v}
          aria-pressed={view === v}
          onClick={() => onChange(v)}
          className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${view === v ? "bg-bark text-cream" : "hover:bg-cream"}`}
        >
          {v === "info" ? "Info view" : "Expressive view"}
        </button>
      ))}
    </div>
  );
}
