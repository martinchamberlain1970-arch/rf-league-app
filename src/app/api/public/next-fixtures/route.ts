import { NextResponse } from "next/server";
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

function todayIsoLondon() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDateLabel(value: string | null) {
  if (!value) return "Date TBC";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export async function GET() {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server configuration missing." }, { status: 500 });
  }

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
      roundLabel: null,
      weekNo: null,
      fixtures: [],
    });
  }

  const [teamsRes, fixturesRes] = await Promise.all([
    adminClient.from("league_teams").select("id,season_id,name").eq("season_id", selectedSeason.id),
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

  const teams = (teamsRes.data ?? []) as TeamRow[];
  const fixtures = ((fixturesRes.data ?? []) as FixtureRow[]).filter((fixture) => fixture.season_id === selectedSeason.id);
  const teamById = new Map(teams.map((team) => [team.id, team.name]));
  const openFixtures = fixtures.filter((fixture) => fixture.status !== "complete");

  if (openFixtures.length === 0) {
    return NextResponse.json({
      season: selectedSeason,
      roundLabel: null,
      weekNo: null,
      fixtures: [],
    });
  }

  const todayIso = todayIsoLondon();
  const sortedOpenFixtures = [...openFixtures].sort((a, b) => {
    const leftDate = a.fixture_date ?? "9999-12-31";
    const rightDate = b.fixture_date ?? "9999-12-31";
    return leftDate.localeCompare(rightDate) || (a.week_no ?? 999) - (b.week_no ?? 999) || a.id.localeCompare(b.id);
  });

  const anchorFixture =
    sortedOpenFixtures.find((fixture) => (fixture.fixture_date ?? "9999-12-31") >= todayIso) ??
    sortedOpenFixtures[0];

  const selectedFixtures = anchorFixture.week_no !== null
    ? sortedOpenFixtures.filter((fixture) => fixture.week_no === anchorFixture.week_no)
    : sortedOpenFixtures.filter((fixture) => fixture.fixture_date === anchorFixture.fixture_date);

  const primaryDate = selectedFixtures.find((fixture) => fixture.fixture_date)?.fixture_date ?? anchorFixture.fixture_date ?? null;
  const roundLabel = anchorFixture.week_no !== null ? `Week ${anchorFixture.week_no}` : "Next Round";

  return NextResponse.json({
    season: selectedSeason,
    roundLabel,
    weekNo: anchorFixture.week_no,
    fixtureDate: primaryDate,
    fixtureDateLabel: formatDateLabel(primaryDate),
    fixtures: selectedFixtures.map((fixture) => ({
      id: fixture.id,
      fixtureDate: fixture.fixture_date,
      weekNo: fixture.week_no,
      homeTeam: teamById.get(fixture.home_team_id) ?? "Home",
      awayTeam: teamById.get(fixture.away_team_id) ?? "Away",
      status: fixture.status,
    })),
  });
}
