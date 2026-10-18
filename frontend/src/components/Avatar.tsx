// A round profile picture: the uploaded photo if there is one, otherwise the person's initials
// on their chosen colour. Brown ring, like the logo.
import type { MiniProfile } from "@/lib/types";

const SIZES = {
  xs: "h-8 w-8 border-2 text-[11px]",
  sm: "h-10 w-10 border-2 text-sm",
  md: "h-20 w-20 border-[5px] text-2xl",
  lg: "h-28 w-28 border-[7px] text-3xl",
  xl: "h-40 w-40 border-[10px] text-5xl sm:h-52 sm:w-52 sm:border-[12px] sm:text-6xl",
};

// "Amira Khan" -> "AK", "Priya" -> "PR".
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
  return letters.toUpperCase();
}

export default function Avatar({
  person,
  size = "md",
}: {
  person: Pick<MiniProfile, "name" | "avatar_emoji" | "avatar_color" | "photo_url">;
  size?: keyof typeof SIZES;
}) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border-bark ${SIZES[size]}`}
      style={{ background: person.photo_url ? "var(--color-cream)" : `${person.avatar_color}55` }}
    >
      {person.photo_url ? (
        // A plain <img>: photos come from our own API and are already small.
        <img src={person.photo_url} alt={`${person.name}'s profile photo`} className="h-full w-full object-cover" />
      ) : (
        <span role="img" aria-label={`${person.name}'s avatar`} className="font-extrabold tracking-wide text-bark">
          {initials(person.name)}
        </span>
      )}
    </div>
  );
}
