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
  const sourcePlayerIds = Array.isArray(body?.source_player_ids)
    ? body.source_player_ids.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  if (!sourceApp) {
    return NextResponse.json({ error: "source_app is required." }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  let linkQuery = adminClient
    .from("external_player_links")
    .select("league_player_id,source_player_id")
    .eq("source_app", sourceApp);
  if (sourcePlayerIds.length > 0) {
    linkQuery = linkQuery.in("source_player_id", sourcePlayerIds);
  }
  const linkRes = await linkQuery;
  if (linkRes.error) {
    return NextResponse.json({ error: linkRes.error.message }, { status: 400 });
  }

  const links = (linkRes.data ?? []) as Array<{ league_player_id: string; source_player_id: string }>;
  const leagueIds = Array.from(new Set(links.map((row) => row.league_player_id).filter(Boolean)));
  if (leagueIds.length === 0) {
    return NextResponse.json({ ok: true, players: [] });
  }

  const playersRes = await adminClient
    .from("players")
    .select("id,full_name,display_name,rating_snooker,peak_rating_snooker,rated_matches_snooker,snooker_handicap,snooker_handicap_base")
    .in("id", leagueIds);
  if (playersRes.error) {
    return NextResponse.json({ error: playersRes.error.message }, { status: 400 });
  }

  const playerById = new Map(
    ((playersRes.data ?? []) as Array<{
      id: string;
      full_name: string | null;
      display_name: string;
      rating_snooker: number | null;
      peak_rating_snooker: number | null;
      rated_matches_snooker: number | null;
      snooker_handicap: number | null;
      snooker_handicap_base: number | null;
    }>).map((player) => [player.id, player])
  );

  return NextResponse.json({
    ok: true,
    players: links
      .map((link) => {
        const player = playerById.get(link.league_player_id);
        if (!player) return null;
        return {
          source_player_id: link.source_player_id,
          league_player_id: link.league_player_id,
          full_name: player.full_name,
          display_name: player.display_name,
          rating_snooker: player.rating_snooker,
          peak_rating_snooker: player.peak_rating_snooker,
          rated_matches_snooker: player.rated_matches_snooker,
          snooker_handicap: player.snooker_handicap,
          snooker_handicap_base: player.snooker_handicap_base,
        };
      })
      .filter(Boolean),
  });
}
