import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  const sourcePlayerId = typeof body?.source_player_id === "string" ? body.source_player_id.trim() : "";
  const leaguePlayerId = typeof body?.league_player_id === "string" ? body.league_player_id.trim() : "";

  if (!sourceApp || !sourcePlayerId || !leaguePlayerId) {
    return NextResponse.json({ error: "source_app, source_player_id, and league_player_id are required." }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const upsertRes = await adminClient
    .from("external_player_links")
    .upsert(
      {
        source_app: sourceApp,
        source_player_id: sourcePlayerId,
        league_player_id: leaguePlayerId,
      },
      { onConflict: "source_app,source_player_id" }
    )
    .select("id,source_app,source_player_id,league_player_id")
    .single();

  if (upsertRes.error) {
    return NextResponse.json({ error: upsertRes.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, link: upsertRes.data });
}
