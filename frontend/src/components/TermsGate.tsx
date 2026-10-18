"use client";

// Shown instead of the app when someone hasn't accepted the CURRENT Terms of Service:
// accounts made before the Terms existed, "Try the demo" visitors, and everyone after a material change
// (raise TERMS_VERSION in backend/.env). The server enforces this too (backend/app/auth.py).
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { useOptions } from "@/lib/options";
import { MeetkatMark } from "./Brand";
import { ErrorBox } from "./States";
import { Button, FrameCard } from "./ui";

export default function TermsGate() {
  const { me, setMe, logout } = useAuth();
  const { options } = useOptions();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;
  const changed = me.terms.accepted_version !== null;
  const minAge = options?.min_age ?? 18;

  async function accept() {
    if (!agreed) {
      setError("Tick the box first, or log out if you don't agree.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setMe(await api.acceptTerms(me!.terms.current_version));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <p className="mb-4 flex items-center justify-center gap-2 text-2xl font-extrabold">
          <MeetkatMark className="h-10 w-10" /> {BRAND.name}
        </p>
        <FrameCard>
          <div className="space-y-4 p-6 sm:p-8">
            <h1 className="text-2xl font-bold">{changed ? "Our Terms have changed" : "Before you continue"}</h1>
            <p>
              {changed
                ? `Please read the updated Terms of Service before using ${BRAND.name} again.`
                : `Please read and accept ${BRAND.name}'s Terms of Service to continue.`}{" "}
              {me.is_demo && "This is a demo account, so everything in it is fictional."}
            </p>
            <label className="flex min-h-11 items-start gap-3">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 accent-bark" />
              <span>
                I am at least {minAge} years old, and I agree to the{" "}
                <Link href="/terms" target="_blank" className="font-semibold underline">Terms of Service</Link> and{" "}
                <Link href="/guidelines" target="_blank" className="font-semibold underline">Community Guidelines</Link>.
              </span>
            </label>
            <p className="pl-8 text-sm">
              Read our <Link href="/privacy" target="_blank" className="font-semibold underline">Privacy Policy</Link> to
              understand how {BRAND.name} handles your information.
            </p>
            {error && <ErrorBox message={error} />}
            <div className="flex flex-wrap gap-2">
              <Button onClick={accept} disabled={busy}>{busy ? "Saving…" : "Accept and continue"}</Button>
              <Button variant="outline" onClick={logout}>Log out</Button>
            </div>
          </div>
        </FrameCard>
      </div>
    </main>
  );
}
