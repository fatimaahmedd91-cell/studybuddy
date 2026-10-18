"use client";

// Forgot password: ask for a reset code by email, then choose a new password with it.
// Works only when the server has an email (SMTP) account set up; otherwise it says so.
// The server gives the same answer whether or not an email has an account, and this page shows
// that answer as it is: it never claims an email was sent.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MeerkatMark } from "@/components/Brand";
import { ErrorBox, Notice } from "@/components/States";
import { Button, Field, FrameCard, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { BRAND } from "@/lib/brand";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [requested, setRequested] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setRequested((await api.requestPasswordReset(email)).message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== again) return setError("The new passwords don't match.");
    setBusy(true);
    try {
      await api.confirmPasswordReset(email, code.trim(), password);
      router.push("/login?reset=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-4 flex items-center justify-center gap-2 text-2xl font-extrabold">
          <MeerkatMark className="h-10 w-10" /> {BRAND.name}
        </Link>
        <FrameCard>
          <div className="space-y-4 p-6 sm:p-8">
            <h1 className="text-3xl font-bold">Forgot your password?</h1>
            {!requested ? (
              <form onSubmit={ask} className="space-y-4">
                <p className="text-sm">Enter the email you log in with. If it has an account, we&apos;ll email a 6-digit code to reset your password.</p>
                <Field label="Email" htmlFor="reset-email">
                  <input id="reset-email" type="email" required autoComplete="email" value={email}
                    onChange={(e) => setEmail(e.target.value)} className={inputClass} />
                </Field>
                {error && <ErrorBox message={error} />}
                <Button type="submit" disabled={busy} className="w-full">{busy ? "One moment…" : "Get a reset code"}</Button>
              </form>
            ) : (
              <form onSubmit={reset} className="space-y-4">
                <Notice kind="info">{requested}</Notice>
                <Field label="Code from the email" htmlFor="reset-code" hint="It works for 15 minutes.">
                  <input id="reset-code" inputMode="numeric" autoComplete="one-time-code" required pattern="\s*[0-9]{6}\s*"
                    maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} className={inputClass} />
                </Field>
                <Field label="New password" htmlFor="reset-password" hint="At least 8 characters.">
                  <input id="reset-password" type="password" required minLength={8} maxLength={128} autoComplete="new-password"
                    value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
                </Field>
                <Field label="New password again" htmlFor="reset-again">
                  <input id="reset-again" type="password" required minLength={8} maxLength={128} autoComplete="new-password"
                    value={again} onChange={(e) => setAgain(e.target.value)} className={inputClass} />
                </Field>
                {error && <ErrorBox message={error} />}
                <Button type="submit" disabled={busy} className="w-full">{busy ? "One moment…" : "Set new password"}</Button>
                <button type="button" onClick={() => { setRequested(null); setError(null); setCode(""); }}
                  className="w-full text-center text-sm font-semibold underline">
                  Use a different email or ask for a new code
                </button>
              </form>
            )}
            <p className="text-center text-sm">
              Remembered it? <Link href="/login" className="font-semibold underline">Log in</Link>
            </p>
          </div>
        </FrameCard>
      </div>
    </main>
  );
}
