import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { applyGroupSnookerRating, resolveCanonicalPlayerId } from "@/lib/snooker-rating";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sharedRatingApiKey = process.env.SHARED_RATING_API_KEY?.trim() ?? "";

export async function POST(req: NextRequest) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }
  if (!sharedRatingApiKey) {
    return NextResponse.json({ error: "Shared rating API key is not configured." }, { status: 500 });
  }

  const suppliedKey = req.headers.get("x-shared-rating-key")?.trim() ?? "";
  if (!suppliedKey || suppliedKey !== sharedRatingApiKey) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const sourceApp = body?.source_app === "club" || body?.source_app === "league" ? body.source_app : null;
  const sourceResultId = typeof body?.source_result_id === "string" ? body.source_result_id.trim() : "";
  const winnerPlayerId = typeof body?.winner_player_id === "string" ? body.winner_player_id.trim() : "";
  const loserPlayerId = typeof body?.loser_player_id === "string" ? body.loser_player_id.trim() : "";
  const winnerSourcePlayerId = typeof body?.winner_source_player_id === "string" ? body.winner_source_player_id.trim() : "";
  const loserSourcePlayerId = typeof body?.loser_source_player_id === "string" ? body.loser_source_player_id.trim() : "";
  const winnerScore = Number(body?.winner_score ?? 1);
  const loserScore = Number(body?.loser_score ?? 0);
  const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
  const metadata = typeof body?.metadata === "object" && body.metadata ? body.metadata : {};

  if (!sourceApp || !sourceResultId) {
    return NextResponse.json({ error: "source_app and source_result_id are required." }, { status: 400 });
  }
  if (!Number.isFinite(winnerScore) || !Number.isFinite(loserScore)) {
    return NextResponse.json({ error: "Scores must be numeric." }, { status: 400 });
  }
  if (winnerScore < loserScore) {
    return NextResponse.json({ error: "winner_score must be greater than or equal to loser_score." }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  try {
    const winnerCanonicalId = await resolveCanonicalPlayerId(
      adminClient,
      sourceApp,
      winnerPlayerId || null,
      winnerSourcePlayerId || null
    );
    const loserCanonicalId = await resolveCanonicalPlayerId(
      adminClient,
      sourceApp,
      loserPlayerId || null,
      loserSourcePlayerId || null
    );

    if (!winnerCanonicalId || !loserCanonicalId) {
      return NextResponse.json({ error: "Could not resolve both players to canonical league player ids." }, { status: 400 });
    }
    if (winnerCanonicalId === loserCanonicalId) {
      return NextResponse.json({ error: "Winner and loser must be different players." }, { status: 400 });
    }

    const result = await applyGroupSnookerRating({
      adminClient,
      sourceApp,
      sourceResultId,
      groupAIds: [winnerCanonicalId],
      groupBIds: [loserCanonicalId],
      scoreA: winnerScore,
      scoreB: loserScore,
      notes: notes || `Shared snooker result from ${sourceApp}`,
      metadata,
    });

    return NextResponse.json({
      ok: true,
      skipped: result.skipped,
      reason: "reason" in result ? result.reason : null,
      winner_player_id: winnerCanonicalId,
      loser_player_id: loserCanonicalId,
      delta_winner: "deltaA" in result ? result.deltaA : 0,
      delta_loser: "deltaB" in result ? result.deltaB : 0,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to apply rating." }, { status: 400 });
  }
}
