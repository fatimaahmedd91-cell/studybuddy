// A round profile picture: the uploaded photo if there is one, otherwise the chosen emoji
// on the chosen colour. Brown ring and cream fill, like the design.
import type { MiniProfile } from "@/lib/types";

const SIZES = {
  xs: "h-8 w-8 border-2 text-base",
  sm: "h-10 w-10 border-2 text-xl",
  md: "h-20 w-20 border-[5px] text-4xl",
  lg: "h-28 w-28 border-[7px] text-5xl",
  xl: "h-40 w-40 border-[10px] text-7xl sm:h-52 sm:w-52 sm:border-[12px] sm:text-8xl",
};

export default function Avatar({
  person,
  size = "md",
}: {
  person: Pick<MiniProfile, "name" | "avatar_emoji" | "avatar_color" | "photo_url">;
  size?: keyof typeof SIZES;
}) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border-pine ${SIZES[size]}`}
      style={{ background: person.photo_url ? "var(--color-paper)" : `${person.avatar_color}33` }}
    >
      {person.photo_url ? (
        // A plain <img>: photos come from our own API and are already small.
        <img src={person.photo_url} alt={`${person.name}'s profile photo`} className="h-full w-full object-cover" />
      ) : (
        <span role="img" aria-label={`${person.name}'s avatar`}>
          {person.avatar_emoji}
        </span>
      )}
    </div>
  );
}
