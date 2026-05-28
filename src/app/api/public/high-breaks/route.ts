import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SeasonRow = {
  id: string;
  name: string;
  is_published: boolean | null;
};

type TeamRow = {
  id: string;
  name: string;
};

type FixtureRow = {
  id: string;
  season_id: string;
  fixture_date: string | null;
  home_team_id: string;
  away_team_id: string;
  status: "pending" | "in_progress" | "complete";
};

type BreakRow = {
  fixture_id: string;
  player_id: string | null;
  entered_player_name: string | null;
  break_value: number | null;
};

type PlayerRow = {
  id: string;
  display_name: string;
  full_name: string | null;
};

function named(player?: PlayerRow | null) {
  return player?.full_name?.trim() || player?.display_name || "Unknown";
}

function normaliseName(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export async function GET(req: NextRequest) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server configuration missing." }, { status: 500 });
  }

  const seasonIdParam = req.nextUrl.searchParams.get("seasonId")?.trim() ?? "all";
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const [seasonsRes, teamsRes, fixturesRes, breaksRes, playersRes] = await Promise.all([
    adminClient.from("league_seasons").select("id,name,is_published").eq("is_published", true).order("created_at", { ascending: false }),
    adminClient.from("league_teams").select("id,name"),
    adminClient.from("league_fixtures").select("id,season_id,fixture_date,home_team_id,away_team_id,status").eq("status", "complete"),
    adminClient.from("league_fixture_breaks").select("fixture_id,player_id,entered_player_name,break_value").gte("break_value", 30).order("break_value", { ascending: false }),
    adminClient.from("players").select("id,display_name,full_name").eq("is_archived", false),
  ]);

  const firstError =
    seasonsRes.error?.message ||
    teamsRes.error?.message ||
    fixturesRes.error?.message ||
    breaksRes.error?.message ||
    playersRes.error?.message;

  if (firstError) {
    return NextResponse.json({ error: firstError }, { status: 500 });
  }

  const seasons = (seasonsRes.data ?? []) as SeasonRow[];
  const teams = (teamsRes.data ?? []) as TeamRow[];
  const fixtures = (fixturesRes.data ?? []) as FixtureRow[];
  const breaks = (breaksRes.data ?? []) as BreakRow[];
  const players = (playersRes.data ?? []) as PlayerRow[];

  const playerById = new Map(players.map((player) => [player.id, player]));
  const playerIdByNormalisedName = new Map<string, string>();
  for (const player of players) {
    const full = normaliseName(player.full_name);
    const display = normaliseName(player.display_name);
    if (full && !playerIdByNormalisedName.has(full)) playerIdByNormalisedName.set(full, player.id);
    if (display && !playerIdByNormalisedName.has(display)) playerIdByNormalisedName.set(display, player.id);
  }
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
  const allowedSeasonIds = seasonIdParam === "all" ? null : new Set([seasonIdParam]);

  const rowsByPlayer = new Map<
    string,
    {
      key: string;
      player_name: string;
      high_break: number;
      century_count: number;
      breaks_30_plus: number;
      league_names: Set<string>;
      break_history: Array<{
        break_value: number;
        fixture_label: string;
        fixture_date: string | null;
      }>;
    }
  >();
  const seenByPlayer = new Map<string, Set<string>>();

  const seasonNameById = new Map(seasons.map((season) => [season.id, season.name]));
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));

  for (const row of breaks) {
    const fixture = fixtureById.get(row.fixture_id);
    if (!fixture) continue;
    if (allowedSeasonIds && !allowedSeasonIds.has(fixture.season_id)) continue;

    const breakValue = Number(row.break_value ?? 0);
    if (!Number.isFinite(breakValue) || breakValue < 30) continue;

    const manualName = row.entered_player_name?.trim() || "";
    const resolvedPlayerId = row.player_id ?? playerIdByNormalisedName.get(normaliseName(manualName)) ?? null;
    const key = resolvedPlayerId ?? `manual:${normaliseName(manualName || "Unknown")}`;
    const playerName = resolvedPlayerId
      ? (playerById.get(resolvedPlayerId)?.full_name?.trim() || playerById.get(resolvedPlayerId)?.display_name || manualName || "Unknown")
      : manualName || "Unknown";

    const existing = rowsByPlayer.get(key) ?? {
      key,
      player_name: playerName,
      high_break: 0,
      century_count: 0,
      breaks_30_plus: 0,
      league_names: new Set<string>(),
      break_history: [],
    };
    const dedupeKey = `${fixture.id}|${breakValue}|${normaliseName(playerName)}`;
    const seen = seenByPlayer.get(key) ?? new Set<string>();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    seenByPlayer.set(key, seen);

    existing.player_name = playerName;
    existing.high_break = Math.max(existing.high_break, breakValue);
    existing.breaks_30_plus += 1;
    if (breakValue >= 100) existing.century_count += 1;
    existing.league_names.add(seasonNameById.get(fixture.season_id) ?? "Published league");
    existing.break_history.push({
      break_value: breakValue,
      fixture_label: `${teamNameById.get(fixture.home_team_id) ?? "Home team"} vs ${teamNameById.get(fixture.away_team_id) ?? "Away team"}`,
      fixture_date: fixture.fixture_date,
    });
    rowsByPlayer.set(key, existing);
  }

  const rows = Array.from(rowsByPlayer.values())
    .map((row) => ({
      key: row.key,
      player_name: row.player_name,
      high_break: row.high_break,
      century_count: row.century_count,
      breaks_30_plus: row.breaks_30_plus,
      league_names: Array.from(row.league_names).sort(),
      break_history: [...row.break_history].sort((a, b) => {
        const valueGap = b.break_value - a.break_value;
        if (valueGap !== 0) return valueGap;
        return (b.fixture_date ?? "").localeCompare(a.fixture_date ?? "");
      }),
    }))
    .sort((a, b) => b.high_break - a.high_break || b.century_count - a.century_count || b.breaks_30_plus - a.breaks_30_plus || a.player_name.localeCompare(b.player_name))
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return NextResponse.json({
    seasons: seasons.map((season) => ({ id: season.id, name: season.name })),
    selected_season_id: seasonIdParam,
    rows,
  });
}
