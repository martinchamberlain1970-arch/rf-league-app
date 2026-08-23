import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: responseHeaders });
}

type SeasonRow = {
  id: string;
  name: string;
  created_at: string | null;
  is_published: boolean | null;
  is_active?: boolean | null;
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
    return json({ error: "Server configuration missing." }, 500);
  }

  const requestedSeasonId = req.nextUrl.searchParams.get("seasonId")?.trim() ?? "";
  const draftToken = req.nextUrl.searchParams.get("draft")?.trim() ?? "";
  const validDraftToken = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draftToken);
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const seasonsRes = await adminClient
    .from("league_seasons")
    .select("id,name,created_at,is_published")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  if (seasonsRes.error) {
    return json({ error: seasonsRes.error.message }, 500);
  }

  const seasons = (seasonsRes.data ?? []) as SeasonRow[];
  let selectedSeason = requestedSeasonId
    ? seasons.find((season) => season.id === requestedSeasonId) ?? null
    : null;
  let isDraftPreview = false;
  let draftAccessibleSeasons: SeasonRow[] = [];

  if (requestedSeasonId && !selectedSeason && validDraftToken) {
    const draftLinkRes = await adminClient
      .from("league_fixture_draft_links")
      .select("season_id")
      .eq("share_token", draftToken)
      .maybeSingle();

    if (draftLinkRes.error) {
      const migrationMissing = /league_fixture_draft_links|schema cache|does not exist/i.test(draftLinkRes.error.message);
      return json(
        { error: migrationMissing ? "This draft fixture link is not available yet." : draftLinkRes.error.message },
        migrationMissing ? 404 : 500
      );
    }
    if (draftLinkRes.data) {
      const tokenSeasonRes = await adminClient
        .from("league_seasons")
        .select("id,name,created_at,is_published,is_active")
        .eq("id", draftLinkRes.data.season_id)
        .eq("is_active", true)
        .maybeSingle();
      if (tokenSeasonRes.error) {
        return json({ error: tokenSeasonRes.error.message }, 500);
      }
      if (tokenSeasonRes.data) {
        const tokenSeason = tokenSeasonRes.data as SeasonRow;
        draftAccessibleSeasons = [tokenSeason];
        const winterYear = tokenSeason.name.match(/\b\d{4}\/\d{4}\b/)?.[0] ?? "";
        const isWinterDivision = /premier league|division 1/i.test(tokenSeason.name);
        if (winterYear && isWinterDivision) {
          const siblingSeasonsRes = await adminClient
            .from("league_seasons")
            .select("id,name,created_at,is_published,is_active")
            .eq("is_active", true)
            .ilike("name", `%${winterYear}%`)
            .order("name", { ascending: true });
          if (siblingSeasonsRes.error) {
            return json({ error: siblingSeasonsRes.error.message }, 500);
          }
          const winterDivisions = ((siblingSeasonsRes.data ?? []) as SeasonRow[])
            .filter((season) => /premier league|division 1/i.test(season.name));
          if (winterDivisions.length > 0) draftAccessibleSeasons = winterDivisions;
        }

        selectedSeason = draftAccessibleSeasons.find((season) => season.id === requestedSeasonId) ?? null;
        isDraftPreview = Boolean(selectedSeason);
      }
    }
  }

  if (requestedSeasonId && !selectedSeason) {
    return json(
      {
        seasons: [],
        season: null,
        fixtures: [],
        error: "This draft link is invalid or has expired, or the league is not currently published.",
      },
      404
    );
  }

  if (!selectedSeason && seasons.length > 0) {
    const openFixturesRes = await adminClient
      .from("league_fixtures")
      .select("season_id")
      .in("season_id", seasons.map((season) => season.id))
      .neq("status", "complete");

    if (openFixturesRes.error) {
      return json({ error: openFixturesRes.error.message }, 500);
    }

    const seasonsWithOpenFixtures = new Set(
      (openFixturesRes.data ?? []).map((fixture) => String(fixture.season_id))
    );
    selectedSeason = seasons.find((season) => seasonsWithOpenFixtures.has(season.id)) ?? seasons[0] ?? null;
  }

  if (!selectedSeason) {
    return json({ seasons: [], season: null, fixtures: [] });
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
    return json({ error: firstError }, 500);
  }

  const teamNameById = new Map(
    ((teamsRes.data ?? []) as TeamRow[]).map((team) => [team.id, team.name])
  );
  const fixtures = (fixturesRes.data ?? []) as FixtureRow[];

  return json({
    seasons: isDraftPreview
      ? draftAccessibleSeasons.map(({ id, name }) => ({ id, name }))
      : seasons.map(({ id, name }) => ({ id, name })),
    season: { id: selectedSeason.id, name: selectedSeason.name },
    isDraftPreview,
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
