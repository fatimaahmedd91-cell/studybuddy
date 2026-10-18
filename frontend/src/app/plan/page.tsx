"use client";

// Plan: find times that work for everyone (/plan) and manage your private schedule (/plan?tab=schedule).
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import MySchedule from "@/components/plan/MySchedule";
import PlanHangout from "@/components/plan/PlanHangout";
import { Loading } from "@/components/States";
import { PageHeading } from "@/components/ui";

const TABS = [
  { key: "hangout", label: "Plan a hangout", href: "/plan" },
  { key: "schedule", label: "My schedule", href: "/plan?tab=schedule" },
];

function PlanContent() {
  const tab = useSearchParams().get("tab") === "schedule" ? "schedule" : "hangout";
  return (
    <div>
      <PageHeading title="Plan">
        <nav aria-label="Plan sections" className="flex rounded-2xl border-2 border-pine p-1">
          {TABS.map((t) => (
            <Link key={t.key} href={t.href} aria-current={tab === t.key ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-xl px-4 font-semibold ${tab === t.key ? "bg-pine text-cream" : "hover:bg-sage"}`}>
              {t.label}
            </Link>
          ))}
        </nav>
      </PageHeading>
      {tab === "schedule" ? <MySchedule /> : <PlanHangout />}
    </div>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PlanContent />
    </Suspense>
  );
}
