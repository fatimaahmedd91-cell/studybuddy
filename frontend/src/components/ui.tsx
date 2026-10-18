// Small building blocks used on every page, so the whole site matches the design.
// Colours come from the tokens in src/app/globals.css (bark, forest, sky, cream, sand, danger...).
import Link from "next/link";

// The thick brown frame with a soft blue inside (like the logo), used for most cards.
export function FrameCard({
  children,
  className = "",
  inner = "bg-sky",
}: {
  children: React.ReactNode;
  className?: string;
  inner?: string;
}) {
  return (
    <div className={`rounded-frame bg-bark p-2.5 sm:p-3.5 ${className}`}>
      <div className={`h-full rounded-inner ${inner}`}>{children}</div>
    </div>
  );
}

// A dark brown panel with cream text, like "Upcoming Events!" in the design.
export function DarkPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-frame bg-bark p-5 text-cream sm:p-6 ${className}`}>{children}</section>;
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "dark" | "outline" | "light" | "danger";
};

// primary: green, for the main action on a screen. dark: brown, for actions on light cards.
const VARIANTS = {
  primary: "bg-forest text-cream hover:bg-bark",
  dark: "bg-bark text-cream hover:brightness-125",
  outline: "border-2 border-bark text-bark hover:bg-cream",
  light: "bg-cream text-bark hover:bg-sky",
  danger: "border-2 border-danger text-danger hover:bg-cream",
};

export function Button({ variant = "primary", className = "", children, ...props }: ButtonProps) {
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
  variant = "primary",
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
        <p className="mt-1 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "w-full min-h-11 rounded-xl border-2 border-bark/30 bg-cream px-3 py-2 text-bark placeholder:text-bark/50 focus:border-bark";

export function Chip({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${strong ? "bg-bark text-cream" : "bg-cream text-bark"}`}
    >
      {children}
    </span>
  );
}

export function DemoBadge() {
  return (
    <span
      className="rounded-full border border-bark/40 bg-sand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bark"
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

// An on/off switch with a label and an optional explanation. It's a real checkbox underneath,
// so keyboards and screen readers understand it.
export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start justify-between gap-4 rounded-xl bg-cream px-3 py-2">
      <span>
        <span className="font-semibold">{label}</span>
        {description && <span className="mt-0.5 block text-sm">{description}</span>}
      </span>
      <span className="relative mt-1 inline-flex shrink-0">
        <input type="checkbox" role="switch" checked={checked} disabled={disabled}
          onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span aria-hidden="true"
          className="h-7 w-12 rounded-full bg-sky-strong transition peer-checked:bg-forest peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-forest peer-disabled:opacity-50" />
        <span aria-hidden="true"
          className="absolute left-1 top-1 h-5 w-5 rounded-full bg-cream shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

// A titled settings block with an id, so the page can link to it (#privacy).
export function SettingsSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <FrameCard>
      <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 space-y-3 p-5 sm:p-6">
        <h2 id={`${id}-title`} className="text-2xl font-bold">{title}</h2>
        {children}
      </section>
    </FrameCard>
  );
}
