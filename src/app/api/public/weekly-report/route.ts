import { NextRequest, NextResponse } from "next/server";
import {
  buildPublicWeeklyReport,
  getPublicLeagueAdminClient,
} from "@/lib/public-league-weekly";

export async function GET(req: NextRequest) {
  try {
    const adminClient = getPublicLeagueAdminClient();
    const seasonId = req.nextUrl.searchParams.get("seasonId")?.trim() || null;
    const weekParam = req.nextUrl.searchParams.get("week")?.trim() || "";
    const weekNo = /^\d+$/.test(weekParam) ? Number(weekParam) : null;
    const payload = await buildPublicWeeklyReport(adminClient, seasonId, weekNo);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load weekly report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
