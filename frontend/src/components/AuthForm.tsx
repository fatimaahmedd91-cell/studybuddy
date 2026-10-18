"use client";

// The login and sign-up forms. After success, AppShell sends you to onboarding or the feed.
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ErrorBox } from "./States";
import { Button, Field, OrangeCard, inputClass } from "./ui";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { startSession } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmAge, setConfirmAge] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSignup = mode === "signup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (isSignup && !confirmAge) {
      setError("Please confirm you're 16 or older.");
      return;
    }
    setBusy(true);
    try {
      const session = isSignup ? await api.signup(email, password, name, confirmAge) : await api.login(email, password);
      startSession(session.access_token, session.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-4 block text-center text-2xl font-extrabold">FriendFinder</Link>
        <OrangeCard>
          <form onSubmit={submit} className="space-y-4 p-6 sm:p-8">
            <h1 className="text-3xl font-bold">{isSignup ? "Create your account" : "Welcome back"}</h1>
            {isSignup && (
              <Field label="Name" htmlFor="name">
                <input id="name" required maxLength={60} autoComplete="name" value={name}
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
            {isSignup && (
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <input type="checkbox" checked={confirmAge} onChange={(e) => setConfirmAge(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[#401800]" />
                <span>I&apos;m 16 or older, and I understand FriendFinder is for making friends (not dating).</span>
              </label>
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
        </OrangeCard>
      </div>
    </main>
  );
}
