import type { Metadata } from "next";
import CompetitionMatchScorecard from "@/components/CompetitionMatchScorecard";
import { emptyAdminState } from "@/lib/admin-status-controller";

export const metadata: Metadata = {
  title: "Private competition scorecard",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function PrivateScorecardPage() {
  return <CompetitionMatchScorecard guest admin={emptyAdminState} />;
}
