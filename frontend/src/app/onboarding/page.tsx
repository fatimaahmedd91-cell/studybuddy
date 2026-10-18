"use client";

// First-time setup: fill in your profile so Discover can match you with people.
import { useRouter } from "next/navigation";
import ProfileForm from "@/components/ProfileForm";
import { FrameCard } from "@/components/ui";
import { useMe } from "@/lib/auth";

export default function OnboardingPage() {
  const me = useMe();
  const router = useRouter();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold sm:text-4xl">Welcome, {me.name.split(" ")[0]}!</h1>
      <p className="mt-2">
        Tell people a little about yourself. You need a university, at least one interest, and one thing you&apos;re
        looking for. Everything else is optional, and you can change it later.
      </p>
      <FrameCard className="mt-5">
        <div className="p-5 sm:p-7">
          <ProfileForm profile={me} mode="onboarding" onSaved={(user) => user.onboarded && router.replace("/feed")} />
        </div>
      </FrameCard>
    </div>
  );
}
