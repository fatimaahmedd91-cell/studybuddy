// Privacy Policy. The text is in src/content/legal.ts.
import LegalPage from "@/components/LegalPage";
import { PRIVACY, PRIVACY_SUMMARY } from "@/content/legal";

export const metadata = { title: "Privacy Policy · Meetkat" };

export default function PrivacyPage() {
  return <LegalPage doc={PRIVACY} summary={PRIVACY_SUMMARY} />;
}
