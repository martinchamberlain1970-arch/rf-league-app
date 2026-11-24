import type { Metadata } from "next";
import CompetitionScorecardPicker from "@/components/CompetitionScorecardPicker";

export const metadata: Metadata = {
  title: "Competition results",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function PrivateScorecardPage() {
  return <CompetitionScorecardPicker />;
}
