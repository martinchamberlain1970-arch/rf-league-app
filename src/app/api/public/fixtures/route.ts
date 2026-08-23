import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SeasonRow = {
  id: string;
  name: string;
  created_at: string | null;
};

type TeamRow = {
  id: string;
  name: string;
};

type FixtureRow = {
  id: string;
  fixture_date: string | null;
  week_no: number | null;
  home_team_id: string;
  away_team_id: string;
  status: "pending" | "in_progress" | "complete";
  home_points: number | null;
  away_points: number | null;
};

export async function GET(req: NextRequest) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server configuration missing." }, { status: 500 });
  }

  const requestedSeasonId = req.nextUrl.searchParams.get("seasonId")?.trim() ?? "";
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const seasonsRes = await adminClient
    .from("league_seasons")
    .select("id,name,created_at")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  if (seasonsRes.error) {
    return NextResponse.json({ error: seasonsRes.error.message }, { status: 500 });
  }

  const seasons = (seasonsRes.data ?? []) as SeasonRow[];
  let selectedSeason = requestedSeasonId
    ? seasons.find((season) => season.id === requestedSeasonId) ?? null
    : null;

  if (requestedSeasonId && !selectedSeason) {
    return NextResponse.json(
      {
        seasons: seasons.map(({ id, name }) => ({ id, name })),
        season: null,
        fixtures: [],
        error: "This league is not currently published.",
      },
      { status: 404 }
    );
  }

  if (!selectedSeason && seasons.length > 0) {
    const openFixturesRes = await adminClient
      .from("league_fixtures")
      .select("season_id")
      .in("season_id", seasons.map((season) => season.id))
      .neq("status", "complete");

    if (openFixturesRes.error) {
      return NextResponse.json({ error: openFixturesRes.error.message }, { status: 500 });
    }

    const seasonsWithOpenFixtures = new Set(
      (openFixturesRes.data ?? []).map((fixture) => String(fixture.season_id))
    );
    selectedSeason = seasons.find((season) => seasonsWithOpenFixtures.has(season.id)) ?? seasons[0] ?? null;
  }

  if (!selectedSeason) {
    return NextResponse.json({ seasons: [], season: null, fixtures: [] });
  }

  const [teamsRes, fixturesRes] = await Promise.all([
    adminClient
      .from("league_teams")
      .select("id,name")
      .eq("season_id", selectedSeason.id),
    adminClient
      .from("league_fixtures")
      .select("id,fixture_date,week_no,home_team_id,away_team_id,status,home_points,away_points")
      .eq("season_id", selectedSeason.id)
      .order("week_no", { ascending: true })
      .order("fixture_date", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  const firstError = teamsRes.error?.message || fixturesRes.error?.message;
  if (firstError) {
    return NextResponse.json({ error: firstError }, { status: 500 });
  }

  const teamNameById = new Map(
    ((teamsRes.data ?? []) as TeamRow[]).map((team) => [team.id, team.name])
  );
  const fixtures = (fixturesRes.data ?? []) as FixtureRow[];

  return NextResponse.json({
    seasons: seasons.map(({ id, name }) => ({ id, name })),
    season: { id: selectedSeason.id, name: selectedSeason.name },
    fixtures: fixtures.map((fixture) => ({
      id: fixture.id,
      fixtureDate: fixture.fixture_date,
      weekNo: fixture.week_no,
      homeTeam: teamNameById.get(fixture.home_team_id) ?? "Home team",
      awayTeam: teamNameById.get(fixture.away_team_id) ?? "Away team",
      status: fixture.status,
      homePoints: fixture.home_points,
      awayPoints: fixture.away_points,
    })),
  });
}
