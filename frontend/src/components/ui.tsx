// Small building blocks used on every page, so the whole site looks like the design.
import type { Post, Student } from "@/lib/data";

// The thick orange frame with a cream inside, used for most cards.
export function OrangeCard({
  children,
  className = "",
  inner = "bg-card",
}: {
  children: React.ReactNode;
  className?: string;
  inner?: string;
}) {
  return (
    <div className={`rounded-[22px] bg-ember p-3 sm:p-4 ${className}`}>
      <div className={`h-full rounded-[16px] ${inner}`}>{children}</div>
    </div>
  );
}

// A round profile picture: brown ring, cream inside, and the student's emoji.
const AVATAR_SIZES = {
  sm: "h-9 w-9 border-2 text-lg",
  md: "h-20 w-20 border-[5px] text-4xl",
  lg: "h-28 w-28 border-[7px] text-5xl",
  xl: "h-40 w-40 sm:h-52 sm:w-52 border-[12px] text-7xl sm:text-8xl",
};

export function Avatar({ student, size = "md" }: { student: Student; size?: keyof typeof AVATAR_SIZES }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full border-bark bg-paper ${AVATAR_SIZES[size]}`}
      role="img"
      aria-label={`${student.name}'s profile picture`}
    >
      <span aria-hidden="true">{student.avatar}</span>
    </div>
  );
}

// "User.id - school" and "Name pronouns" lines from the design.
export function ProfileLines({
  student,
  handle,
  posts,
  friends,
  centered = false,
}: {
  student: Student;
  handle: string;
  posts: number;
  friends: number;
  centered?: boolean;
}) {
  return (
    <div className={centered ? "text-center" : ""}>
      <p className="text-lg font-semibold tracking-wide">@{handle}</p>
      <p className="text-sm">
        {student.name} <span className="opacity-70">{student.pronouns}</span> · {student.uni}
      </p>
      <p className="mt-1 text-sm">
        <b>{posts}</b> posts <span className="mx-2" /> <b>{friends}</b> friends
      </p>
    </div>
  );
}

// One square post: a big emoji on the author's colour, with the caption underneath.
export function PostTile({
  post,
  color,
  className = "w-40 shrink-0 sm:w-44",
}: {
  post: Post;
  color: string;
  className?: string;
}) {
  return (
    <figure className={className}>
      <div
        className="flex aspect-square items-center justify-center rounded-xl border-2 border-bark text-6xl"
        style={{ background: `${color}40` }}
      >
        <span role="img" aria-label="post picture">
          {post.emoji}
        </span>
      </div>
      <figcaption className="mt-1.5 line-clamp-2 text-xs leading-snug">{post.caption}</figcaption>
    </figure>
  );
}

// Dark brown button with cream text, like "JOIN!".
export function DarkButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`rounded-xl bg-bark px-5 py-2.5 font-semibold tracking-wide text-paper transition hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="sr-only">{children}</h1>;
}
