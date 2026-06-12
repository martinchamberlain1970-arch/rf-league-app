import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { targetHandicapFromElo } from "@/lib/snooker-rating";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SeasonRow = {
  id: string;
  name: string;
  is_published?: boolean | null;
  created_at?: string | null;
};

type PlayerRow = {
  id: string;
  display_name: string;
  full_name: string | null;
  claimed_by?: string | null;
  rating_snooker?: number | null;
  rated_matches_snooker?: number | null;
  snooker_handicap?: number | null;
  snooker_handicap_base?: number | null;
};

type LeagueTeamMemberRow = {
  season_id: string;
  player_id: string;
};

const named = (player: PlayerRow) => (player.full_name?.trim() ? player.full_name : player.display_name);

export async function GET(req: NextRequest) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server configuration missing." }, { status: 500 });
  }

  const seasonIdParam = req.nextUrl.searchParams.get("seasonId")?.trim() ?? "";
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const seasonsRes = await adminClient
    .from("league_seasons")
    .select("id,name,is_published,created_at")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  if (seasonsRes.error) {
    return NextResponse.json({ error: seasonsRes.error.message }, { status: 500 });
  }

  const seasons = (seasonsRes.data ?? []) as SeasonRow[];
  const selectedSeason =
    (seasonIdParam ? seasons.find((season) => season.id === seasonIdParam) : null) ?? seasons[0] ?? null;

  if (!selectedSeason) {
    return NextResponse.json({ season: null, handicaps: [] });
  }

  const [playersRes, membersRes] = await Promise.all([
    adminClient
      .from("players")
      .select("id,display_name,full_name,claimed_by,rating_snooker,rated_matches_snooker,snooker_handicap,snooker_handicap_base")
      .eq("is_archived", false),
    adminClient.from("league_team_members").select("season_id,player_id").eq("season_id", selectedSeason.id),
  ]);

  const firstError = playersRes.error?.message || membersRes.error?.message;
  if (firstError) {
    return NextResponse.json({ error: firstError }, { status: 500 });
  }

  const players = (playersRes.data ?? []) as PlayerRow[];
  const members = (membersRes.data ?? []) as LeagueTeamMemberRow[];
  const rosterPlayerIds = new Set(members.map((member) => member.player_id));

  const handicaps = players
    .filter((player) => rosterPlayerIds.has(player.id))
    .sort(
      (a, b) =>
        Number(b.rating_snooker ?? 1000) - Number(a.rating_snooker ?? 1000) ||
        Number(a.snooker_handicap ?? 0) - Number(b.snooker_handicap ?? 0) ||
        named(a).localeCompare(named(b))
    )
    .map((player, index) => ({
      rank: index + 1,
      player_id: player.id,
      player_name: named(player),
      elo: Math.round(Number(player.rating_snooker ?? 1000)),
      target_handicap: targetHandicapFromElo(Number(player.rating_snooker ?? 1000)),
      current_handicap: Number(player.snooker_handicap ?? 0),
      gap_to_target: targetHandicapFromElo(Number(player.rating_snooker ?? 1000)) - Number(player.snooker_handicap ?? 0),
      baseline_handicap: Number(player.snooker_handicap_base ?? player.snooker_handicap ?? 0),
      rated_matches: Number(player.rated_matches_snooker ?? 0),
    }));

  return NextResponse.json({
    season: {
      id: selectedSeason.id,
      name: selectedSeason.name,
    },
    handicaps,
  });
}
