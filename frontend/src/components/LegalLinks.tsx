// Links to the Terms, Privacy Policy and Community Guidelines (landing page, Settings, legal pages).
import Link from "next/link";

export default function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={`flex flex-wrap gap-x-4 gap-y-1 text-sm ${className}`}>
      <Link href="/terms" className="underline">Terms of Service</Link>
      <Link href="/privacy" className="underline">Privacy Policy</Link>
      <Link href="/guidelines" className="underline">Community Guidelines</Link>
    </nav>
  );
}
