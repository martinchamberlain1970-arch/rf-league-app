import { NextRequest, NextResponse } from "next/server";
import {
  buildPublicWeeklyHandicapReview,
  getPublicLeagueAdminClient,
  getPublicPublishedSeasons,
} from "@/lib/public-league-weekly";

export async function GET(req: NextRequest) {
  try {
    const adminClient = getPublicLeagueAdminClient();
    const seasonId = req.nextUrl.searchParams.get("seasonId")?.trim() || null;
    const [payload, seasons] = await Promise.all([
      buildPublicWeeklyHandicapReview(adminClient, seasonId),
      getPublicPublishedSeasons(adminClient),
    ]);
    return NextResponse.json({
      ...payload,
      seasons: seasons.map(({ id, name }) => ({ id, name })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load weekly handicap review.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
