import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { targetHandicapFromElo } from "@/lib/snooker-rating";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail =
  process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ??
  process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL?.trim().toLowerCase() ??
  "";

type PlayerRow = {
  id: string;
  full_name: string | null;
  display_name: string;
  rating_snooker: number | null;
  snooker_handicap: number | null;
  snooker_handicap_base: number | null;
  rated_matches_snooker: number | null;
  is_archived?: boolean | null;
};

type RatingEventRow = {
  player_id: string | null;
  rating_after: number | null;
  created_at: string;
};

type FixtureRow = {
  id: string;
  fixture_date: string | null;
  status: string | null;
};

type FrameRow = {
  fixture_id: string;
  slot_no: number | null;
  winner_side: "home" | "away" | null;
  home_forfeit: boolean | null;
  away_forfeit: boolean | null;
  home_player1_id: string | null;
  home_player2_id: string | null;
  away_player1_id: string | null;
  away_player2_id: string | null;
};

type BreakRow = {
  fixture_id: string;
  player_id: string | null;
  break_value: number | null;
};

type FormSummary = {
  recent: string[];
  streak_label: string | null;
  wins_last_6: number;
  losses_last_6: number;
  high_break: number | null;
  breaks_30_plus: number;
  indicators: string[];
};

const emptyFormSummary = (): FormSummary => ({
  recent: [],
  streak_label: null,
  wins_last_6: 0,
  losses_last_6: 0,
  high_break: null,
  breaks_30_plus: 0,
  indicators: [],
});

function buildFormSummaries(fixtures: FixtureRow[], frames: FrameRow[], breaks: BreakRow[]) {
  const fixtureDateById = new Map(fixtures.map((fixture) => [fixture.id, fixture.fixture_date ?? ""]));
  const resultsByPlayer = new Map<string, string[]>();
  const breakStatsByPlayer = new Map<string, { count: number; high: number }>();

  for (const row of breaks) {
    if (!row.player_id) continue;
    const value = Number(row.break_value ?? 0);
    if (!Number.isFinite(value) || value < 30) continue;
    const stats = breakStatsByPlayer.get(row.player_id) ?? { count: 0, high: 0 };
    stats.count += 1;
    stats.high = Math.max(stats.high, value);
    breakStatsByPlayer.set(row.player_id, stats);
  }

  const orderedFrames = frames
    .filter((frame) => frame.winner_side && !frame.home_forfeit && !frame.away_forfeit)
    .sort(
      (a, b) =>
        (fixtureDateById.get(a.fixture_id) ?? "").localeCompare(fixtureDateById.get(b.fixture_id) ?? "") ||
        Number(a.slot_no ?? 0) - Number(b.slot_no ?? 0)
    );

  for (const frame of orderedFrames) {
    const homeIds = [frame.home_player1_id, frame.home_player2_id].filter(Boolean) as string[];
    const awayIds = [frame.away_player1_id, frame.away_player2_id].filter(Boolean) as string[];
    for (const id of homeIds) {
      const list = resultsByPlayer.get(id) ?? [];
      list.push(frame.winner_side === "home" ? "W" : "L");
      resultsByPlayer.set(id, list);
    }
    for (const id of awayIds) {
      const list = resultsByPlayer.get(id) ?? [];
      list.push(frame.winner_side === "away" ? "W" : "L");
      resultsByPlayer.set(id, list);
    }
  }

  const summaries = new Map<string, FormSummary>();
  const playerIds = new Set([...resultsByPlayer.keys(), ...breakStatsByPlayer.keys()]);

  for (const playerId of playerIds) {
    const recent = (resultsByPlayer.get(playerId) ?? []).slice(-6);
    const wins = recent.filter((item) => item === "W").length;
    const losses = recent.filter((item) => item === "L").length;
    const breakStats = breakStatsByPlayer.get(playerId) ?? { count: 0, high: 0 };
    const indicators: string[] = [];
    let streakLabel: string | null = null;

    if (recent.length >= 3) {
      const last = recent[recent.length - 1];
      let streak = 0;
      for (let index = recent.length - 1; index >= 0; index -= 1) {
        if (recent[index] !== last) break;
        streak += 1;
      }
      if (streak >= 3) {
        streakLabel = `${streak} frame ${last === "W" ? "win" : "loss"} streak`;
        indicators.push(streakLabel);
      }
    }

    if (recent.length >= 5 && wins >= 5) indicators.push(`Hot form: ${wins}/${recent.length} recent frame wins`);
    if (recent.length >= 5 && losses >= 5) indicators.push(`Cold spell: ${losses}/${recent.length} recent frame losses`);
    if (breakStats.count >= 3) indicators.push(`${breakStats.count} recorded 30+ breaks this season`);
    if (breakStats.high >= 50) indicators.push(`High-break threat: ${breakStats.high}`);

    summaries.set(playerId, {
      recent,
      streak_label: streakLabel,
      wins_last_6: wins,
      losses_last_6: losses,
      high_break: breakStats.high || null,
      breaks_30_plus: breakStats.count,
      indicators,
    });
  }

  return summaries;
}

export async function GET(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Missing auth token." }, { status: 401 });

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const authRes = await authClient.auth.getUser(token);
  const user = authRes.data.user;
  if (authRes.error || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const email = user.email?.trim().toLowerCase() ?? "";
  if (!superAdminEmail || email !== superAdminEmail) {
    return NextResponse.json({ error: "Only Super User can access the Elo audit." }, { status: 403 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const seasonsRes = await adminClient
    .from("league_seasons")
    .select("id,name,is_published,created_at")
    .eq("is_published", true)
    .order("created_at", { ascending: false });
  if (seasonsRes.error) {
    return NextResponse.json({ error: seasonsRes.error.message }, { status: 400 });
  }

  const selectedSeason = (seasonsRes.data ?? [])[0] ?? null;
  let memberRows: Array<{ player_id: string | null }> = [];
  let membershipSource = "league_team_members";

  if (selectedSeason?.id) {
    const liveMemberRes = await adminClient
      .from("league_team_members")
      .select("player_id")
      .eq("season_id", selectedSeason.id);
    if (liveMemberRes.error) {
      return NextResponse.json({ error: liveMemberRes.error.message }, { status: 400 });
    }
    memberRows = liveMemberRes.data ?? [];
  }

  if (memberRows.length === 0) {
    membershipSource = "league_registered_team_members";
    const memberRes = await adminClient.from("league_registered_team_members").select("player_id");
    if (memberRes.error) {
      return NextResponse.json({ error: memberRes.error.message }, { status: 400 });
    }
    memberRows = memberRes.data ?? [];
  }

  const playerIds = Array.from(
    new Set(memberRows.map((row) => row.player_id).filter((value): value is string => Boolean(value)))
  );
  if (playerIds.length === 0) {
    return NextResponse.json({
      generated_at: new Date().toISOString(),
      season: selectedSeason ? { id: selectedSeason.id, name: selectedSeason.name } : null,
      membership_source: membershipSource,
      summary: {
        total_players: 0,
        players_with_any_flags: 0,
        players_with_form_indicators: 0,
        handicap_aligned: 0,
        handicap_misaligned: 0,
        rating_aligned: 0,
        rating_misaligned: 0,
        rated_match_count_aligned: 0,
        rated_match_count_misaligned: 0,
      },
      rows: [],
    });
  }

  const [playersRes, eventsRes, fixturesRes] = await Promise.all([
    adminClient
      .from("players")
      .select("id,full_name,display_name,rating_snooker,snooker_handicap,snooker_handicap_base,rated_matches_snooker,is_archived")
      .in("id", playerIds)
      .eq("is_archived", false),
    adminClient
      .from("rating_events")
      .select("player_id,rating_after,created_at")
      .in("player_id", playerIds)
      .order("created_at", { ascending: false }),
    selectedSeason?.id
      ? adminClient
          .from("league_fixtures")
          .select("id,fixture_date,status")
          .eq("season_id", selectedSeason.id)
          .eq("status", "complete")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const firstError = playersRes.error?.message || eventsRes.error?.message || fixturesRes.error?.message;
  if (firstError) {
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const players = (playersRes.data ?? []) as PlayerRow[];
  const events = (eventsRes.data ?? []) as RatingEventRow[];
  const fixtures = (fixturesRes.data ?? []) as FixtureRow[];
  const fixtureIds = fixtures.map((fixture) => fixture.id);

  const [framesRes, breaksRes] =
    fixtureIds.length > 0
      ? await Promise.all([
          adminClient
            .from("league_fixture_frames")
            .select("fixture_id,slot_no,winner_side,home_forfeit,away_forfeit,home_player1_id,home_player2_id,away_player1_id,away_player2_id")
            .in("fixture_id", fixtureIds),
          adminClient
            .from("league_fixture_breaks")
            .select("fixture_id,player_id,break_value")
            .in("fixture_id", fixtureIds)
            .gte("break_value", 30),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];

  const formError = framesRes.error?.message || breaksRes.error?.message;
  if (formError) {
    return NextResponse.json({ error: formError }, { status: 400 });
  }

  const formSummaries = buildFormSummaries(fixtures, (framesRes.data ?? []) as FrameRow[], (breaksRes.data ?? []) as BreakRow[]);

  const eventCountByPlayer = new Map<string, number>();
  const latestEventByPlayer = new Map<string, RatingEventRow>();

  for (const event of events) {
    const playerId = event.player_id ?? "";
    if (!playerId) continue;
    eventCountByPlayer.set(playerId, (eventCountByPlayer.get(playerId) ?? 0) + 1);
    if (!latestEventByPlayer.has(playerId)) latestEventByPlayer.set(playerId, event);
  }

  const rows = players
    .map((player) => {
      const name = player.full_name?.trim() || player.display_name || "Unknown player";
      const currentRating = Math.round(Number(player.rating_snooker ?? 1000));
      const currentHandicap = Number(player.snooker_handicap ?? 0);
      const baselineHandicap = Number(player.snooker_handicap_base ?? player.snooker_handicap ?? 0);
      const targetHandicap = targetHandicapFromElo(Number(player.rating_snooker ?? 1000));
      const handicapGap = targetHandicap - currentHandicap;
      const ratedMatchesStored = Number(player.rated_matches_snooker ?? 0);
      const ratingEventCount = eventCountByPlayer.get(player.id) ?? 0;
      const latestEvent = latestEventByPlayer.get(player.id) ?? null;
      const latestEventRating = latestEvent?.rating_after !== null && typeof latestEvent?.rating_after !== "undefined"
        ? Math.round(Number(latestEvent.rating_after))
        : null;
      const ratingGap = latestEventRating === null ? 0 : currentRating - latestEventRating;
      const flags: string[] = [];
      if (handicapGap !== 0) flags.push("handicap_not_aligned_to_elo");
      if (latestEventRating !== null && ratingGap !== 0) flags.push("current_elo_differs_from_latest_rating_event");
      if (ratedMatchesStored !== ratingEventCount) flags.push("rated_match_count_differs_from_rating_events");
      if (ratedMatchesStored === 0 && (currentRating !== 1000 || currentHandicap !== 0 || targetHandicap !== 0)) {
        flags.push("unrated_player_has_non_default_values");
      }
      const form = formSummaries.get(player.id) ?? emptyFormSummary();

      return {
        player_id: player.id,
        player_name: name,
        current_rating: currentRating,
        latest_event_rating: latestEventRating,
        rating_gap: ratingGap,
        current_handicap: currentHandicap,
        target_handicap: targetHandicap,
        handicap_gap: handicapGap,
        baseline_handicap: baselineHandicap,
        rated_matches_stored: ratedMatchesStored,
        rating_event_count: ratingEventCount,
        latest_event_at: latestEvent?.created_at ?? null,
        form,
        form_indicators: form.indicators,
        flags,
      };
    })
    .sort(
      (a, b) =>
        b.flags.length - a.flags.length ||
        Math.abs(b.handicap_gap) - Math.abs(a.handicap_gap) ||
        Math.abs(b.rating_gap) - Math.abs(a.rating_gap) ||
        b.current_rating - a.current_rating ||
        a.player_name.localeCompare(b.player_name)
    );

  const summary = {
    total_players: rows.length,
    players_with_any_flags: rows.filter((row) => row.flags.length > 0).length,
    players_with_form_indicators: rows.filter((row) => row.form_indicators.length > 0).length,
    handicap_aligned: rows.filter((row) => row.handicap_gap === 0).length,
    handicap_misaligned: rows.filter((row) => row.handicap_gap !== 0).length,
    rating_aligned: rows.filter((row) => row.latest_event_rating === null || row.rating_gap === 0).length,
    rating_misaligned: rows.filter((row) => row.latest_event_rating !== null && row.rating_gap !== 0).length,
    rated_match_count_aligned: rows.filter((row) => row.rated_matches_stored === row.rating_event_count).length,
    rated_match_count_misaligned: rows.filter((row) => row.rated_matches_stored !== row.rating_event_count).length,
  };

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    season: selectedSeason ? { id: selectedSeason.id, name: selectedSeason.name } : null,
    membership_source: membershipSource,
    summary,
    rows,
  });
}
