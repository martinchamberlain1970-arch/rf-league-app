import { NextResponse } from "next/server";
import {
  buildPublicWeeklyHandicapReview,
  getPublicLeagueAdminClient,
} from "@/lib/public-league-weekly";

export async function GET() {
  try {
    const adminClient = getPublicLeagueAdminClient();
    const payload = await buildPublicWeeklyHandicapReview(adminClient);
    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load weekly handicap review.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
