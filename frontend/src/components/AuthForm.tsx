"use client";

// Shared form for the login and signup pages. Talks to /api/auth/... on the backend.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { login, signup } from "@/lib/api";
import { useStore } from "@/lib/store";
import { DarkButton, OrangeCard } from "./ui";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { setAccount } = useStore();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isSignup = mode === "signup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = isSignup ? await signup(email, password, name) : await login(email, password);
      setAccount(user);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 w-full rounded-xl border-2 border-bark/30 bg-paper px-4 py-2.5 font-normal";
  return (
    <div className="mx-auto max-w-md pt-4">
      <OrangeCard>
        <form onSubmit={submit} className="space-y-4 p-6 sm:p-8">
          <h1 className="text-3xl font-bold">{isSignup ? "Join FriendFinder" : "Welcome back"}</h1>
          {isSignup && (
            <label className="block text-sm font-medium">
              Name
              <input required maxLength={60} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={input} />
            </label>
          )}
          <label className="block text-sm font-medium">
            Email
            <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              required
              type="password"
              minLength={isSignup ? 8 : 1}
              maxLength={128}
              autoComplete={isSignup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
            />
            {isSignup && <span className="mt-1 block text-xs opacity-70">At least 8 characters.</span>}
          </label>
          {error && (
            <p role="alert" className="rounded-lg bg-paper px-3 py-2 text-sm font-medium text-[#a32a00]">
              {error}
            </p>
          )}
          <DarkButton type="submit" disabled={busy} className="w-full py-3 text-lg">
            {busy ? "One moment…" : isSignup ? "Sign up" : "Log in"}
          </DarkButton>
          <p className="text-center text-sm">
            {isSignup ? "Already have an account? " : "New here? "}
            <Link href={isSignup ? "/login" : "/signup"} className="font-semibold underline">
              {isSignup ? "Log in" : "Sign up"}
            </Link>
          </p>
        </form>
      </OrangeCard>
    </div>
  );
}
