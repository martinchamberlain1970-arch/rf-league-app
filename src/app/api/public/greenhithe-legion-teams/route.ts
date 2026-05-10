import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GREENHITHE_LEGION_LOCATION_NAME, slugFromName } from "@/lib/public-team-display";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;


type SeasonRow = {
  id: string;
  name: string;
  is_published?: boolean | null;
  created_at?: string | null;
};

type LocationRow = {
  id: string;
  name: string;
};

type TeamRow = {
  id: string;
  season_id: string;
  location_id: string | null;
  name: string;
};

type FixtureRow = {
  id: string;
  season_id: string;
  fixture_date: string | null;
  week_no: number | null;
  home_team_id: string;
  away_team_id: string;
  status: "pending" | "in_progress" | "complete";
  home_points: number | null;
  away_points: number | null;
};

type TeamSummary = {
  id: string;
  slug: string;
  name: string;
  played: number;
  won: number;
  lost: number;
  framesFor: number;
  framesAgainst: number;
  frameDiff: number;
  recentResults: Array<{
    fixtureId: string;
    weekNo: number | null;
    fixtureDate: string | null;
    opponent: string;
    venue: "home" | "away";
    result: "W" | "L" | "D";
    score: string;
  }>;
  upcomingFixtures: Array<{
    fixtureId: string;
    weekNo: number | null;
    fixtureDate: string | null;
    opponent: string;
    venue: "home" | "away";
    status: "pending" | "in_progress";
  }>;
};

function byDateAsc(left: FixtureRow, right: FixtureRow) {
  return `${left.fixture_date ?? "9999-12-31"}:${left.id}`.localeCompare(`${right.fixture_date ?? "9999-12-31"}:${right.id}`);
}

function byDateDesc(left: FixtureRow, right: FixtureRow) {
  return `${right.fixture_date ?? "0000-01-01"}:${right.id}`.localeCompare(`${left.fixture_date ?? "0000-01-01"}:${left.id}`);
}

export async function GET(req: NextRequest) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server configuration missing." }, { status: 500 });
  }

  const teamSlug = req.nextUrl.searchParams.get("team")?.trim().toLowerCase() ?? "";
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
  const selectedSeason = seasons[0] ?? null;
  if (!selectedSeason) {
    return NextResponse.json({
      season: null,
      location: null,
      teams: [],
      selectedTeam: null,
    });
  }

  let locationRes = await adminClient
    .from("locations")
    .select("id,name")
    .eq("name", GREENHITHE_LEGION_LOCATION_NAME)
    .maybeSingle();

  if (locationRes.error || !locationRes.data) {
    locationRes = await adminClient
      .from("locations")
      .select("id,name")
      .ilike("name", "%Greenhithe Legion%")
      .order("name", { ascending: true })
      .limit(1)
      .maybeSingle();
  }

  if (locationRes.error || !locationRes.data) {
    return NextResponse.json({ error: locationRes.error?.message ?? "Greenhithe Legion location not found." }, { status: 500 });
  }

  const location = locationRes.data as LocationRow;

  const [teamsRes, fixturesRes] = await Promise.all([
    adminClient
      .from("league_teams")
      .select("id,season_id,location_id,name")
      .eq("season_id", selectedSeason.id)
      .order("name", { ascending: true }),
    adminClient
      .from("league_fixtures")
      .select("id,season_id,fixture_date,week_no,home_team_id,away_team_id,status,home_points,away_points")
      .eq("season_id", selectedSeason.id)
      .order("fixture_date", { ascending: true }),
  ]);

  const firstError = teamsRes.error?.message || fixturesRes.error?.message;
  if (firstError) {
    return NextResponse.json({ error: firstError }, { status: 500 });
  }

  const allTeams = (teamsRes.data ?? []) as TeamRow[];
  const teams = allTeams.filter((team) => team.location_id === location.id);
  const fixtures = (fixturesRes.data ?? []) as FixtureRow[];
  const teamIds = new Set(teams.map((team) => team.id));
  const fixturePool = fixtures.filter((fixture) => teamIds.has(fixture.home_team_id) || teamIds.has(fixture.away_team_id));
  const allTeamNames = new Map(allTeams.map((team) => [team.id, team.name]));

  const summaries: TeamSummary[] = teams.map((team) => {
    const teamFixtures = fixturePool.filter((fixture) => fixture.home_team_id === team.id || fixture.away_team_id === team.id);
    const completedFixtures = teamFixtures.filter((fixture) => fixture.status === "complete").sort(byDateDesc);
    const upcomingFixtures = teamFixtures.filter((fixture) => fixture.status !== "complete").sort(byDateAsc);

    let played = 0;
    let won = 0;
    let lost = 0;
    let framesFor = 0;
    let framesAgainst = 0;

    for (const fixture of completedFixtures) {
      const isHome = fixture.home_team_id === team.id;
      const ownFrames = Number(isHome ? fixture.home_points ?? 0 : fixture.away_points ?? 0);
      const oppFrames = Number(isHome ? fixture.away_points ?? 0 : fixture.home_points ?? 0);
      played += 1;
      framesFor += ownFrames;
      framesAgainst += oppFrames;
      if (ownFrames > oppFrames) won += 1;
      if (ownFrames < oppFrames) lost += 1;
    }

    return {
      id: team.id,
      slug: slugFromName(team.name),
      name: team.name,
      played,
      won,
      lost,
      framesFor,
      framesAgainst,
      frameDiff: framesFor - framesAgainst,
      recentResults: completedFixtures.slice(0, 5).map((fixture) => {
        const isHome = fixture.home_team_id === team.id;
        const ownFrames = Number(isHome ? fixture.home_points ?? 0 : fixture.away_points ?? 0);
        const oppFrames = Number(isHome ? fixture.away_points ?? 0 : fixture.home_points ?? 0);
        return {
          fixtureId: fixture.id,
          weekNo: fixture.week_no,
          fixtureDate: fixture.fixture_date,
          opponent: allTeamNames.get(isHome ? fixture.away_team_id : fixture.home_team_id) ?? "Opponent",
          venue: isHome ? "home" : "away",
          result: ownFrames > oppFrames ? "W" : ownFrames < oppFrames ? "L" : "D",
          score: `${ownFrames}-${oppFrames}`,
        };
      }),
      upcomingFixtures: upcomingFixtures.slice(0, 5).map((fixture) => {
        const isHome = fixture.home_team_id === team.id;
        return {
          fixtureId: fixture.id,
          weekNo: fixture.week_no,
          fixtureDate: fixture.fixture_date,
          opponent: allTeamNames.get(isHome ? fixture.away_team_id : fixture.home_team_id) ?? "Opponent",
          venue: isHome ? "home" : "away",
          status: fixture.status === "in_progress" ? "in_progress" : "pending",
        };
      }),
    };
  });

  const selectedTeam = teamSlug ? summaries.find((team) => team.slug === teamSlug) ?? null : null;

  return NextResponse.json({
    season: selectedSeason,
    location,
    teams: summaries,
    selectedTeam,
    rotationSeconds: 45,
  });
}
