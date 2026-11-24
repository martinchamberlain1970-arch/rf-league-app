"use client";

import { useParams } from "next/navigation";
import CompetitionMatchScorecard from "@/components/CompetitionMatchScorecard";
import RequireAuth from "@/components/RequireAuth";
import useAdminStatus from "@/components/useAdminStatus";

export default function MatchPage() {
  const params = useParams();
  const admin = useAdminStatus();
  return (
    <RequireAuth>
      <CompetitionMatchScorecard key={String(params.id ?? "")} requestedMatchId={String(params.id ?? "")} admin={admin} />
    </RequireAuth>
  );
}
