// Shows only the specific checks someone has passed. There's deliberately no general "Verified" badge:
// none of these checks prove identity, student status or safety.
import type { Badge } from "@/lib/types";

const LABELS: Record<Badge, string> = {
  email_verified: "Email verified",
  phone_verified: "Phone verified",
  age_checked: "Age checked",
};

export default function VerificationBadges({ badges }: { badges: Badge[] }) {
  if (!badges.length) return <p className="text-sm">No verification checks completed.</p>;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Verification checks">
      {badges.map((b) => (
        <li key={b} title="This label means only this specific check. It doesn't confirm identity or safety."
          className="rounded-full bg-success-soft px-3 py-1 text-sm font-semibold text-success">
          ✓ {LABELS[b]}
        </li>
      ))}
    </ul>
  );
}
