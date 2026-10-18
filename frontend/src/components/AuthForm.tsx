"use client";

// The login and sign-up forms. After success, AppShell sends you to onboarding or the feed.
// Sign-up needs one unticked checkbox: age (18+, the proposed launch policy) and the Terms.
// The Privacy Policy is linked separately: reading it is not the same as agreeing to optional features.
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { useOptions } from "@/lib/options";
import { MeetkatMark } from "./Brand";
import { ErrorBox, Notice } from "./States";
import { Button, Field, FrameCard, inputClass } from "./ui";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { startSession } = useAuth();
  const { options } = useOptions();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const isSignup = mode === "signup";
  const minAge = options?.min_age ?? 18;

  // /login?reset=1 comes from the Forgot password page, after the server changed the password.
  useEffect(() => {
    setResetDone(!isSignup && new URLSearchParams(window.location.search).get("reset") === "1");
  }, [isSignup]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (isSignup && !agreed) {
      setError(`To join, tick the box to confirm you're ${minAge} or older and agree to the Terms.`);
      return;
    }
    setBusy(true);
    try {
      const session = isSignup
        ? await api.signup(email, password, name, agreed, options?.terms_version)
        : await api.login(email, password);
      startSession(session.access_token, session.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-4 flex items-center justify-center gap-2 text-2xl font-extrabold">
          <MeetkatMark className="h-10 w-10" /> {BRAND.name}
        </Link>
        <FrameCard>
          <form onSubmit={submit} className="space-y-4 p-6 sm:p-8">
            <h1 className="text-3xl font-bold">{isSignup ? "Create your account" : "Welcome back"}</h1>
            {resetDone && <Notice kind="success">Password changed. Log in with your new password.</Notice>}
            {isSignup && (
              <Field label="Display name" htmlFor="name" hint="What other people see. It doesn't need to be your legal name.">
                <input id="name" required maxLength={60} autoComplete="nickname" value={name}
                  onChange={(e) => setName(e.target.value)} className={inputClass} />
              </Field>
            )}
            <Field label="Email" htmlFor="email" hint={isSignup ? "Used to log in. Never shown to other people." : undefined}>
              <input id="email" type="email" required autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Password" htmlFor="password" hint={isSignup ? "At least 8 characters." : undefined}>
              <input id="password" type="password" required minLength={isSignup ? 8 : 1} maxLength={128}
                autoComplete={isSignup ? "new-password" : "current-password"} value={password}
                onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            </Field>
            {!isSignup && (
              <p className="-mt-2 text-sm">
                <Link href="/forgot-password" className="font-semibold underline">Forgot password?</Link>
              </p>
            )}
            {isSignup && (
              <div className="space-y-2">
                <label className="flex min-h-11 items-start gap-3 text-sm">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-bark" />
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
              </div>
            )}
            {error && <ErrorBox message={error} />}
            <Button type="submit" disabled={busy} className="w-full text-lg">
              {busy ? "One moment…" : isSignup ? "Sign up" : "Log in"}
            </Button>
            <p className="text-center text-sm">
              {isSignup ? "Already have an account? " : "New here? "}
              <Link href={isSignup ? "/login" : "/signup"} className="font-semibold underline">
                {isSignup ? "Log in" : "Create an account"}
              </Link>
            </p>
          </form>
        </FrameCard>
      </div>
    </main>
  );
}
