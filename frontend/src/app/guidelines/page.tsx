// Community Guidelines (draft). The text is in src/content/legal.ts.
import LegalPage from "@/components/LegalPage";
import { GUIDELINES } from "@/content/legal";

export const metadata = { title: "Community Guidelines · Meerkat" };

export default function GuidelinesPage() {
  return <LegalPage doc={GUIDELINES} />;
}
