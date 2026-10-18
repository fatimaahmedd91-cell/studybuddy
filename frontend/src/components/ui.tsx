// Small building blocks used on every page, so the whole site matches the design.
// Colours come from the tokens in src/app/globals.css (bark, ember, paper, card, ice).
import Link from "next/link";

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
    <div className={`rounded-[22px] bg-ember p-2.5 sm:p-3.5 ${className}`}>
      <div className={`h-full rounded-[16px] ${inner}`}>{children}</div>
    </div>
  );
}

// A dark brown panel with cream text, like "Upcoming Events!" in the design.
export function DarkPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[22px] bg-bark p-5 text-paper sm:p-6 ${className}`}>{children}</section>;
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "dark" | "outline" | "light" | "danger" };

const VARIANTS = {
  dark: "bg-bark text-paper hover:brightness-125",
  outline: "border-2 border-bark text-bark hover:bg-paper",
  light: "bg-paper text-bark hover:bg-card",
  danger: "border-2 border-[#a32a00] text-[#a32a00] hover:bg-paper",
};

export function Button({ variant = "dark", className = "", children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "dark",
  className = "",
  children,
}: {
  href: string;
  variant?: keyof typeof VARIANTS;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 font-semibold transition ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

// A labelled form field. Pass the input as children; hint and error show under it.
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className = "",
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-sm font-semibold">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint && !error && <p className="mt-1 text-xs opacity-75">{hint}</p>}
      {error && (
        <p className="mt-1 text-sm font-medium text-[#a32a00]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "w-full min-h-11 rounded-xl border-2 border-bark/30 bg-paper px-3 py-2 text-bark placeholder:text-bark/50 focus:border-bark";

export function Chip({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${strong ? "bg-bark text-paper" : "bg-paper text-bark"}`}
    >
      {children}
    </span>
  );
}

export function DemoBadge() {
  return (
    <span
      className="rounded-full border border-bark/40 bg-ice px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bark"
      title="Fictional demo data"
    >
      Demo
    </span>
  );
}

export function PageHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-3xl font-bold tracking-wide sm:text-4xl">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
