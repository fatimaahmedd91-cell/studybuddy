// Two ways to show the same profile:
//   ProfileInfo        the information view (big photo top-left, name beside it, details below)
//   ProfileExpressive  the expressive view (big centred photo with stickers, hook front and centre)
// Both read the same profile data, so editing your profile changes both.
import type { PublicProfile } from "@/lib/types";
import Avatar from "./Avatar";
import { Chip, DemoBadge, OrangeCard } from "./ui";

// Stickers are picked from the person's interests. Edit this list to add more.
const STICKERS: Record<string, string> = {
  coding: "💻", cafes: "☕", anime: "🍥", badminton: "🏸", gaming: "🎮", basketball: "🏀", books: "📚",
  art: "🎨", yoga: "🧘", music: "🎧", travel: "✈️", photography: "📷", fitness: "💪", chess: "♟️",
  hiking: "🥾", "board games": "🎲", cooking: "🍳", dance: "💃", movies: "🎬", podcasts: "🎙️",
  running: "🏃", soccer: "⚽", volunteering: "🤝", "k-pop": "🎤", hackathons: "🛠️",
};
const EXTRA_STICKERS = ["✨", "⭐", "💬", "🌈"];

function stickersFor(person: PublicProfile) {
  const fromInterests = person.interests.map((i) => STICKERS[i.toLowerCase()]).filter(Boolean);
  return [...new Set([...fromInterests, ...EXTRA_STICKERS])].slice(0, 6);
}

// Places stickers on a ring around the photo (angles in degrees, 0 = right, going clockwise).
const ANGLES = [-150, -60, -10, 40, 130, 190];

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
    <OrangeCard>
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
                <span aria-hidden="true">🎓 </span>
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
    </OrangeCard>
  );
}

export function ProfileExpressive({ person, actions }: { person: PublicProfile; actions?: React.ReactNode }) {
  const stickers = person.stickers ? stickersFor(person) : [];
  return (
    <OrangeCard inner="bg-paper">
      <div className="flex flex-col items-center px-5 pb-8 pt-10 text-center sm:px-10">
        {/* Photo with stickers on a ring around it. The stickers are decoration only. */}
        <div className="relative p-8 sm:p-12">
          <Avatar person={person} size="xl" />
          {stickers.map((sticker, i) => {
            const angle = (ANGLES[i] * Math.PI) / 180;
            return (
              <span
                key={sticker}
                aria-hidden="true"
                className="pointer-events-none absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-bark bg-card text-2xl shadow-md sm:h-14 sm:w-14 sm:text-3xl"
                style={{ left: `${50 + 47 * Math.cos(angle)}%`, top: `${50 + 47 * Math.sin(angle)}%`, rotate: `${(i % 2 ? 1 : -1) * 10}deg` }}
              >
                {sticker}
              </span>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <h1 className="text-4xl font-bold sm:text-5xl">{person.name}</h1>
          {person.is_demo && <DemoBadge />}
        </div>
        {subtitle(person) && <p className="mt-2 text-xl">{subtitle(person)}</p>}
        {person.hook && (
          <p className="mt-5 max-w-xl rounded-2xl bg-ember px-6 py-4 text-2xl font-bold text-paper sm:text-3xl">
            &ldquo;{person.hook}&rdquo;
          </p>
        )}
        {person.university && <p className="mt-4 font-medium">🎓 {person.university}</p>}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {person.interests.map((i) => <Chip key={i}>{i}</Chip>)}
        </div>
        {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
      </div>
    </OrangeCard>
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
          className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${view === v ? "bg-bark text-paper" : "hover:bg-paper"}`}
        >
          {v === "info" ? "Info view" : "Expressive view"}
        </button>
      ))}
    </div>
  );
}
