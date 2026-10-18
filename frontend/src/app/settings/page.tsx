"use client";

// Settings. Each section lives in its own file in src/components/settings/, so it's easy to find and edit.
import { AccountSection, ProfileSection } from "@/components/settings/AccountSection";
import { BlockedSection, NotificationsSection, TermsSection } from "@/components/settings/OtherSections";
import { PrivacySection } from "@/components/settings/PrivacySection";
import { VerificationSection } from "@/components/settings/VerificationSection";
import { PageHeading } from "@/components/ui";

const SECTIONS = [
  ["profile", "Profile"],
  ["account", "Account"],
  ["verification", "Verification"],
  ["privacy", "Privacy"],
  ["notifications", "Notifications"],
  ["blocked", "Blocked"],
  ["terms", "Terms & privacy"],
];

export default function SettingsPage() {
  return (
    <div>
      <PageHeading title="Settings" />
      <nav aria-label="Settings sections" className="mb-5 flex flex-wrap gap-2">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center rounded-full border-2 border-bark bg-cream px-4 text-sm font-semibold hover:bg-sky">
            {label}
          </a>
        ))}
      </nav>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <ProfileSection />
          <AccountSection />
          <VerificationSection />
          <NotificationsSection />
        </div>
        <div className="space-y-5">
          <PrivacySection />
          <BlockedSection />
          <TermsSection />
        </div>
      </div>
    </div>
  );
}
