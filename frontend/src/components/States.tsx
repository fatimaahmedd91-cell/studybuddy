// Loading, error, empty, and success messages, so every page explains what's going on.
import { Button } from "./ui";

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-8" role="status" aria-live="polite">
      <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-pine/25 border-t-pine motion-reduce:animate-none" />
      <span className="font-medium">{label}</span>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-danger bg-cream px-4 py-3">
      <p className="font-medium text-danger">{message}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-pine/40 bg-cream/70 px-5 py-8 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm">{children}</div>}
    </div>
  );
}

const NOTICE_STYLES = {
  success: "bg-success text-white",
  error: "border-2 border-danger bg-danger-soft text-danger",
  warning: "border-2 border-warning bg-warning-soft text-warning",
  info: "border-2 border-sage-strong bg-cream text-pine",
};

// A short message: "Saved" (only after the server confirmed), an error, a warning to double-check
// something, or neutral information such as "Not set up on this server".
export function Notice({ kind, children }: { kind: keyof typeof NOTICE_STYLES; children: React.ReactNode }) {
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm font-medium ${NOTICE_STYLES[kind]}`}>
      {children}
    </p>
  );
}
