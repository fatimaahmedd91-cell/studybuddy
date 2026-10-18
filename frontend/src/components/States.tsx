// Loading, error, empty, and success messages, so every page explains what's going on.
import { Button } from "./ui";

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-8" role="status" aria-live="polite">
      <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-bark/25 border-t-bark motion-reduce:animate-none" />
      <span className="font-medium">{label}</span>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-[#a32a00] bg-paper px-4 py-3">
      <p className="font-medium text-[#a32a00]">{message}</p>
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
    <div className="rounded-2xl border-2 border-dashed border-bark/40 bg-paper/70 px-5 py-8 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm">{children}</div>}
    </div>
  );
}

// A short-lived "Saved" or error line under a form. Only shown after the server confirmed.
export function Notice({ kind, children }: { kind: "success" | "error"; children: React.ReactNode }) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={`rounded-lg px-3 py-2 text-sm font-medium ${
        kind === "error" ? "bg-paper text-[#a32a00]" : "bg-[#1c7c3a] text-white"
      }`}
    >
      {children}
    </p>
  );
}
