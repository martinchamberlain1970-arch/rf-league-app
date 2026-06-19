import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SeasonRow = {
  id: string;
  name: string;
  is_published?: boolean | null;
  created_at?: string | null;
};

type TeamRow = {
  id: string;
  season_id: string;
  name: string;
};

type MemberRow = {
  season_id: string;
  team_id: string;
  player_id: string;
};

type FixtureRow = {
  id: string;
  season_id: string;
  status: "pending" | "in_progress" | "complete";
};

type FrameRow = {
  fixture_id: string;
  slot_type: "singles" | "doubles";
  home_player1_id: string | null;
  away_player1_id: string | null;
  home_forfeit: boolean | null;
  away_forfeit: boolean | null;
  winner_side: "home" | "away" | null;
  home_points_scored?: number | null;
  away_points_scored?: number | null;
};

type PlayerRow = {
  id: string;
  display_name: string;
  full_name: string | null;
};

function named(player?: PlayerRow | null) {
  return player?.full_name?.trim() || player?.display_name || "Unknown";
}

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
    return NextResponse.json({ season: null, players: [] });
  }

  const [teamsRes, membersRes, fixturesRes, framesRes, playersRes] = await Promise.all([
    adminClient.from("league_teams").select("id,season_id,name").eq("season_id", selectedSeason.id),
    adminClient.from("league_team_members").select("season_id,team_id,player_id").eq("season_id", selectedSeason.id),
    adminClient.from("league_fixtures").select("id,season_id,status").eq("season_id", selectedSeason.id),
    adminClient
      .from("league_fixture_frames")
      .select("fixture_id,slot_type,home_player1_id,away_player1_id,home_forfeit,away_forfeit,winner_side,home_points_scored,away_points_scored"),
    adminClient.from("players").select("id,display_name,full_name").eq("is_archived", false),
  ]);

  const firstError =
    teamsRes.error?.message ||
    membersRes.error?.message ||
    fixturesRes.error?.message ||
    framesRes.error?.message ||
    playersRes.error?.message;

  if (firstError) {
    return NextResponse.json({ error: firstError }, { status: 500 });
  }

  const teams = (teamsRes.data ?? []) as TeamRow[];
  const members = (membersRes.data ?? []) as MemberRow[];
  const fixtures = ((fixturesRes.data ?? []) as FixtureRow[]).filter((fixture) => fixture.season_id === selectedSeason.id);
  const frames = (framesRes.data ?? []) as FrameRow[];
  const players = (playersRes.data ?? []) as PlayerRow[];

  const playerById = new Map(players.map((player) => [player.id, player]));
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const playerTeamName = new Map<string, string>();
  for (const member of members) {
    if (!playerTeamName.has(member.player_id)) {
      playerTeamName.set(member.player_id, teamById.get(member.team_id)?.name ?? "-");
    }
  }

  const singlesAppearanceByPlayer = new Map<string, Set<string>>();
  const singlesPlayed = new Map<string, { won: number; lost: number; pointsFor: number; pointsAgainst: number }>();
  const fixtureIds = new Set(fixtures.map((fixture) => fixture.id));

  for (const frame of frames.filter((row) => fixtureIds.has(row.fixture_id) && row.slot_type === "singles")) {
    const homeId = frame.home_player1_id;
    const awayId = frame.away_player1_id;
    if (homeId) {
      const set = singlesAppearanceByPlayer.get(homeId) ?? new Set<string>();
      set.add(frame.fixture_id);
      singlesAppearanceByPlayer.set(homeId, set);
    }
    if (awayId) {
      const set = singlesAppearanceByPlayer.get(awayId) ?? new Set<string>();
      set.add(frame.fixture_id);
      singlesAppearanceByPlayer.set(awayId, set);
    }

    if (!frame.winner_side || frame.home_forfeit || frame.away_forfeit) continue;
    const homePoints = typeof frame.home_points_scored === "number" ? frame.home_points_scored : 0;
    const awayPoints = typeof frame.away_points_scored === "number" ? frame.away_points_scored : 0;

    if (homeId) {
      const prev = singlesPlayed.get(homeId) ?? { won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0 };
      if (frame.winner_side === "home") prev.won += 1;
      else prev.lost += 1;
      prev.pointsFor += homePoints;
      prev.pointsAgainst += awayPoints;
      singlesPlayed.set(homeId, prev);
    }
    if (awayId) {
      const prev = singlesPlayed.get(awayId) ?? { won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0 };
      if (frame.winner_side === "away") prev.won += 1;
      else prev.lost += 1;
      prev.pointsFor += awayPoints;
      prev.pointsAgainst += homePoints;
      singlesPlayed.set(awayId, prev);
    }
  }

  const rosterPlayerIds = new Set<string>(members.map((member) => member.player_id));
  const playersTable = Array.from(new Set<string>([...rosterPlayerIds, ...singlesAppearanceByPlayer.keys(), ...singlesPlayed.keys()]))
    .map((playerId) => {
      const result = singlesPlayed.get(playerId) ?? { won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0 };
      const played = result.won + result.lost;
      return {
        player_id: playerId,
        player_name: named(playerById.get(playerId)),
        team_name: playerTeamName.get(playerId) ?? "-",
        appearances: singlesAppearanceByPlayer.get(playerId)?.size ?? 0,
        played,
        won: result.won,
        lost: result.lost,
        points_for: result.pointsFor,
        points_against: result.pointsAgainst,
        win_pct: played > 0 ? Math.round((result.won / played) * 1000) / 10 : 0,
      };
    })
    .filter((row) => row.played > 0)
    .sort((a, b) => b.won - a.won || b.win_pct - a.win_pct || b.played - a.played || a.player_name.localeCompare(b.player_name))
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return NextResponse.json({
    season: {
      id: selectedSeason.id,
      name: selectedSeason.name,
    },
    players: playersTable,
  });
}
