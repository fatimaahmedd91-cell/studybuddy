// Terms of Service (draft). The text is in src/content/legal.ts.
import LegalPage from "@/components/LegalPage";
import { TERMS } from "@/content/legal";

export const metadata = { title: "Terms of Service · Meetkat" };

export default function TermsPage() {
  return <LegalPage doc={TERMS} />;
}
