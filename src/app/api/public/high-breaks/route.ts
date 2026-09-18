import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchAllSupabasePages, fetchAllSupabasePagesByChunks } from "@/lib/supabase-pagination";

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

type CompetitionRow = { id: string; name: string; sport_type: string | null };
type CompetitionMatchRow = { id: string; competition_id: string; status: string; round_no: number | null; match_no: number | null };
type CompetitionBreakRow = {
  match_id: string;
  competition_id: string;
  player_id: string | null;
  entered_player_name: string | null;
  break_value: number | null;
  created_at: string | null;
};

function normaliseName(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

type AggregatedBreakRow = {
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
    source_type: "league" | "competition";
  }>;
};

function rankRows(rowsByPlayer: Map<string, AggregatedBreakRow>) {
  return Array.from(rowsByPlayer.values())
    .map((row) => ({
      key: row.key,
      player_name: row.player_name,
      high_break: row.high_break,
      century_count: row.century_count,
      breaks_30_plus: row.breaks_30_plus,
      league_names: Array.from(row.league_names).sort(),
      break_history: [...row.break_history].sort((a, b) => b.break_value - a.break_value || (b.fixture_date ?? "").localeCompare(a.fixture_date ?? "")),
    }))
    .sort((a, b) => b.high_break - a.high_break || b.century_count - a.century_count || b.breaks_30_plus - a.breaks_30_plus || a.player_name.localeCompare(b.player_name))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function addBreak(
  rowsByPlayer: Map<string, AggregatedBreakRow>,
  seenByPlayer: Map<string, Set<string>>,
  details: {
    key: string;
    playerName: string;
    breakValue: number;
    sourceName: string;
    historyLabel: string;
    historyDate: string | null;
    sourceType: "league" | "competition";
    dedupeKey: string;
  }
) {
  const seen = seenByPlayer.get(details.key) ?? new Set<string>();
  if (seen.has(details.dedupeKey)) return;
  seen.add(details.dedupeKey);
  seenByPlayer.set(details.key, seen);
  const existing = rowsByPlayer.get(details.key) ?? {
    key: details.key,
    player_name: details.playerName,
    high_break: 0,
    century_count: 0,
    breaks_30_plus: 0,
    league_names: new Set<string>(),
    break_history: [],
  };
  existing.player_name = details.playerName;
  existing.high_break = Math.max(existing.high_break, details.breakValue);
  existing.breaks_30_plus += 1;
  if (details.breakValue >= 100) existing.century_count += 1;
  existing.league_names.add(details.sourceName);
  existing.break_history.push({
    break_value: details.breakValue,
    fixture_label: details.historyLabel,
    fixture_date: details.historyDate,
    source_type: details.sourceType,
  });
  rowsByPlayer.set(details.key, existing);
}

export async function GET(req: NextRequest) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server configuration missing." }, { status: 500 });
  }

  const seasonIdParam = req.nextUrl.searchParams.get("seasonId")?.trim() ?? "all";
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const seasonsRes = await adminClient
    .from("league_seasons")
    .select("id,name,is_published")
    .eq("is_published", true)
    .order("created_at", { ascending: false });
  if (seasonsRes.error) {
    return NextResponse.json({ error: seasonsRes.error.message }, { status: 500 });
  }

  const seasons = (seasonsRes.data ?? []) as SeasonRow[];
  const selectedSeason = seasonIdParam === "all" ? null : seasons.find((season) => season.id === seasonIdParam) ?? null;
  if (seasonIdParam !== "all" && !selectedSeason) {
    return NextResponse.json({ error: "Choose a published league season." }, { status: 400 });
  }
  const selectedSeasonIds = selectedSeason ? [selectedSeason.id] : seasons.map((season) => season.id);
  const [fixturesRes, competitionsRes, playersRes] = await Promise.all([
    selectedSeasonIds.length > 0
      ? fetchAllSupabasePages<FixtureRow>((from, to) =>
          adminClient
            .from("league_fixtures")
            .select("id,season_id,fixture_date,home_team_id,away_team_id,status")
            .in("season_id", selectedSeasonIds)
            .eq("status", "complete")
            .order("id", { ascending: true })
            .range(from, to)
        )
      : Promise.resolve({ data: [], error: null }),
    fetchAllSupabasePages<CompetitionRow>((from, to) =>
      adminClient
        .from("competitions")
        .select("id,name,sport_type")
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllSupabasePages<PlayerRow>((from, to) =>
      adminClient
        .from("players")
        .select("id,display_name,full_name")
        .eq("is_archived", false)
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);
  const initialError = fixturesRes.error?.message || competitionsRes.error?.message || playersRes.error?.message;
  if (initialError) {
    return NextResponse.json({ error: initialError }, { status: 500 });
  }

  const fixtures = (fixturesRes.data ?? []) as FixtureRow[];
  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const teamIds = Array.from(new Set(fixtures.flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id])));
  const competitions = (competitionsRes.data ?? []) as CompetitionRow[];
  const snookerCompetitionIds = competitions
    .filter((competition) => String(competition.sport_type ?? "").toLowerCase() === "snooker")
    .map((competition) => competition.id);
  const [teamsRes, breaksRes, competitionMatchesRes, competitionBreaksRes] = await Promise.all([
    fetchAllSupabasePagesByChunks<TeamRow, string>(teamIds, (chunk, from, to) =>
      adminClient
        .from("league_teams")
        .select("id,name")
        .in("id", chunk)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllSupabasePagesByChunks<BreakRow, string>(fixtureIds, (chunk, from, to) =>
      adminClient
        .from("league_fixture_breaks")
        .select("fixture_id,player_id,entered_player_name,break_value")
        .in("fixture_id", chunk)
        .gte("break_value", 30)
        .order("fixture_id", { ascending: true })
        .order("break_value", { ascending: false })
        .range(from, to)
    ),
    fetchAllSupabasePagesByChunks<CompetitionMatchRow, string>(snookerCompetitionIds, (chunk, from, to) =>
      adminClient
        .from("matches")
        .select("id,competition_id,status,round_no,match_no")
        .in("competition_id", chunk)
        .eq("status", "complete")
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllSupabasePagesByChunks<CompetitionBreakRow, string>(snookerCompetitionIds, (chunk, from, to) =>
      adminClient
        .from("competition_match_breaks")
        .select("match_id,competition_id,player_id,entered_player_name,break_value,created_at")
        .in("competition_id", chunk)
        .gte("break_value", 30)
        .order("competition_id", { ascending: true })
        .order("match_id", { ascending: true })
        .range(from, to)
    ),
  ]);
  const detailError =
    teamsRes.error?.message ||
    breaksRes.error?.message ||
    competitionMatchesRes.error?.message ||
    competitionBreaksRes.error?.message;
  if (detailError) {
    return NextResponse.json({ error: detailError }, { status: 500 });
  }

  const teams = (teamsRes.data ?? []) as TeamRow[];
  const breaks = (breaksRes.data ?? []) as BreakRow[];
  const players = (playersRes.data ?? []) as PlayerRow[];
  const competitionMatches = (competitionMatchesRes.data ?? []) as CompetitionMatchRow[];
  const competitionBreaks = (competitionBreaksRes.data ?? []) as CompetitionBreakRow[];

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

  const leagueRowsByPlayer = new Map<string, AggregatedBreakRow>();
  const leagueSeenByPlayer = new Map<string, Set<string>>();

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

    const dedupeKey = `${fixture.id}|${breakValue}|${normaliseName(playerName)}`;
    addBreak(leagueRowsByPlayer, leagueSeenByPlayer, {
      key,
      playerName,
      breakValue,
      sourceName: seasonNameById.get(fixture.season_id) ?? "Published league",
      historyLabel: `${teamNameById.get(fixture.home_team_id) ?? "Home team"} vs ${teamNameById.get(fixture.away_team_id) ?? "Away team"}`,
      historyDate: fixture.fixture_date,
      sourceType: "league",
      dedupeKey,
    });
  }

  const selectedSeasonName = seasonIdParam === "all" ? null : seasonNameById.get(seasonIdParam) ?? null;
  const selectedSeasonLabel = selectedSeasonName?.match(/\b\d{4}(?:[/-]\d{2,4})?\b/)?.[0] ?? null;
  const competitionById = new Map(competitions.filter((competition) => String(competition.sport_type ?? "").toLowerCase() === "snooker").map((competition) => [competition.id, competition]));
  const competitionMatchById = new Map(competitionMatches.map((match) => [match.id, match]));
  const competitionRowsByPlayer = new Map<string, AggregatedBreakRow>();
  const competitionSeenByPlayer = new Map<string, Set<string>>();

  for (const row of competitionBreaks) {
    const match = competitionMatchById.get(row.match_id);
    const competition = competitionById.get(row.competition_id);
    if (!match || !competition || match.competition_id !== competition.id) continue;
    if (selectedSeasonLabel && !competition.name.trim().endsWith(selectedSeasonLabel)) continue;
    const breakValue = Number(row.break_value ?? 0);
    if (!Number.isFinite(breakValue) || breakValue < 30) continue;
    const manualName = row.entered_player_name?.trim() || "";
    const resolvedPlayerId = row.player_id ?? playerIdByNormalisedName.get(normaliseName(manualName)) ?? null;
    const key = resolvedPlayerId ?? `manual:${normaliseName(manualName || "Unknown")}`;
    const playerName = resolvedPlayerId
      ? (playerById.get(resolvedPlayerId)?.full_name?.trim() || playerById.get(resolvedPlayerId)?.display_name || manualName || "Unknown")
      : manualName || "Unknown";
    addBreak(competitionRowsByPlayer, competitionSeenByPlayer, {
      key,
      playerName,
      breakValue,
      sourceName: competition.name,
      historyLabel: `${competition.name} · Round ${match.round_no ?? "-"}, match ${match.match_no ?? "-"}`,
      historyDate: row.created_at?.slice(0, 10) ?? null,
      sourceType: "competition",
      dedupeKey: `${match.id}|${breakValue}|${normaliseName(playerName)}`,
    });
  }

  const overallRowsByPlayer = new Map<string, AggregatedBreakRow>();
  for (const sourceRows of [leagueRowsByPlayer, competitionRowsByPlayer]) {
    for (const [key, row] of sourceRows) {
      const current = overallRowsByPlayer.get(key) ?? {
        key,
        player_name: row.player_name,
        high_break: 0,
        century_count: 0,
        breaks_30_plus: 0,
        league_names: new Set<string>(),
        break_history: [],
      };
      current.player_name = row.player_name;
      current.high_break = Math.max(current.high_break, row.high_break);
      current.century_count += row.century_count;
      current.breaks_30_plus += row.breaks_30_plus;
      row.league_names.forEach((name) => current.league_names.add(name));
      current.break_history.push(...row.break_history);
      overallRowsByPlayer.set(key, current);
    }
  }

  const leagueRows = rankRows(leagueRowsByPlayer);
  const competitionRows = rankRows(competitionRowsByPlayer);
  const overallRows = rankRows(overallRowsByPlayer);

  return NextResponse.json({
    seasons: seasons.map((season) => ({ id: season.id, name: season.name })),
    selected_season_id: seasonIdParam,
    rows: overallRows,
    league_rows: leagueRows,
    competition_rows: competitionRows,
    overall_rows: overallRows,
  });
}
