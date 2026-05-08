import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { targetHandicapFromElo } from "@/lib/snooker-rating";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SeasonRow = {
  id: string;
  name: string;
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
  fixture_date: string | null;
  week_no: number | null;
  home_team_id: string;
  away_team_id: string;
  status: "pending" | "in_progress" | "complete";
  home_points: number | null;
  away_points: number | null;
};

type FrameRow = {
  fixture_id: string;
  slot_no: number | null;
  slot_type: "singles" | "doubles" | null;
  winner_side: "home" | "away" | null;
  home_player1_id: string | null;
  home_player2_id: string | null;
  away_player1_id: string | null;
  away_player2_id: string | null;
  home_points_scored: number | null;
  away_points_scored: number | null;
  home_forfeit: boolean | null;
  away_forfeit: boolean | null;
};

type PlayerRow = {
  id: string;
  display_name: string;
  full_name: string | null;
  rating_snooker: number | null;
  snooker_handicap: number | null;
};

type ReceiptRow = {
  source_result_id: string;
  source_app: string | null;
  status: string | null;
  metadata: {
    rating_mode?: string;
    expected_a?: number;
    player_deltas?: Array<{
      player_id: string;
      delta: number;
      side: "home" | "away";
    }>;
    rated_frame_count?: number;
  } | null;
};

type RatingEventRow = {
  player_id: string;
  rating_delta: number | null;
  source_result_id: string | null;
};

type ReviewFrameRow = {
  fixture_id: string;
  slot_no: number | null;
  slot_type: "singles" | "doubles" | null;
  home_player1_id: string | null;
  home_player2_id: string | null;
  away_player1_id: string | null;
  away_player2_id: string | null;
};

type TeamStats = {
  recent: string[];
  played: number;
  won: number;
  lost: number;
  draw: number;
  points: number;
  framesFor: number;
  framesAgainst: number;
};

function named(player?: PlayerRow | null) {
  return player?.full_name?.trim() || player?.display_name || "Unknown";
}

function avg(values: number[], fallback: number) {
  if (!values.length) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formScore(recent: string[]) {
  return recent.reduce((sum, item) => sum + (item === "W" ? 1 : item === "D" ? 0 : -1), 0);
}

function fmtDate(dateStr?: string | null) {
  if (!dateStr) return "Date TBC";
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function getPublicLeagueAdminClient(): SupabaseClient {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Server configuration missing.");
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function getLatestPublishedSeason(adminClient: SupabaseClient, seasonId?: string | null) {
  const seasonsRes = await adminClient
    .from("league_seasons")
    .select("id,name,created_at")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  if (seasonsRes.error) throw new Error(seasonsRes.error.message);
  const seasons = (seasonsRes.data ?? []) as SeasonRow[];
  return (seasonId ? seasons.find((season) => season.id === seasonId) : null) ?? seasons[0] ?? null;
}

export async function buildPublicWeeklyReport(adminClient: SupabaseClient, seasonId?: string | null, weekNo?: number | null) {
  const season = await getLatestPublishedSeason(adminClient, seasonId);
  if (!season) {
    return {
      season: null,
      week: null,
      summary: null,
      fixtures: [],
    };
  }

  const [teamsRes, membersRes, fixturesRes, framesRes, playersRes, receiptsRes] = await Promise.all([
    adminClient.from("league_teams").select("id,season_id,name").eq("season_id", season.id),
    adminClient.from("league_team_members").select("season_id,team_id,player_id").eq("season_id", season.id),
    adminClient
      .from("league_fixtures")
      .select("id,season_id,fixture_date,week_no,home_team_id,away_team_id,status,home_points,away_points")
      .eq("season_id", season.id)
      .order("fixture_date", { ascending: true }),
    adminClient
      .from("league_fixture_frames")
      .select("fixture_id,slot_no,slot_type,winner_side,home_player1_id,home_player2_id,away_player1_id,away_player2_id,home_points_scored,away_points_scored,home_forfeit,away_forfeit"),
    adminClient
      .from("players")
      .select("id,display_name,full_name,rating_snooker,snooker_handicap")
      .eq("is_archived", false),
    adminClient
      .from("rating_result_receipts")
      .select("source_result_id,source_app,status,metadata")
      .eq("source_app", "league"),
  ]);

  const firstError =
    teamsRes.error?.message ||
    membersRes.error?.message ||
    fixturesRes.error?.message ||
    framesRes.error?.message ||
    playersRes.error?.message ||
    receiptsRes.error?.message;
  if (firstError) throw new Error(firstError);

  const teams = (teamsRes.data ?? []) as TeamRow[];
  const members = (membersRes.data ?? []) as MemberRow[];
  const fixtures = (fixturesRes.data ?? []) as FixtureRow[];
  const frames = (framesRes.data ?? []) as FrameRow[];
  const players = (playersRes.data ?? []) as PlayerRow[];
  const receipts = (receiptsRes.data ?? []) as ReceiptRow[];

  const completeWeeks = Array.from(
    new Set(
      fixtures
        .filter((fixture) => fixture.week_no !== null)
        .map((fixture) => fixture.week_no as number)
        .filter((week) => fixtures.filter((fixture) => fixture.week_no === week).every((fixture) => fixture.status === "complete"))
    )
  ).sort((a, b) => b - a);
  const selectedWeek = weekNo ?? completeWeeks[0] ?? null;
  if (!selectedWeek) {
    return {
      season,
      week: null,
      summary: null,
      fixtures: [],
    };
  }

  const weekFixtures = fixtures
    .filter((fixture) => fixture.week_no === selectedWeek)
    .sort((a, b) => (a.fixture_date ?? "").localeCompare(b.fixture_date ?? ""));
  if (!weekFixtures.length) {
    return {
      season,
      week: selectedWeek,
      summary: null,
      fixtures: [],
    };
  }

  const teamById = new Map(teams.map((team) => [team.id, team.name]));
  const playerById = new Map(players.map((player) => [player.id, player]));
  const playerNameMap = new Map(players.map((player) => [player.id, named(player)]));
  const playersByTeam = new Map<string, PlayerRow[]>();
  for (const member of members) {
    const player = playerById.get(member.player_id);
    if (!player) continue;
    const list = playersByTeam.get(member.team_id) ?? [];
    list.push(player);
    playersByTeam.set(member.team_id, list);
  }

  const teamStats = new Map<string, TeamStats>();
  for (const team of teams) {
    teamStats.set(team.id, {
      recent: [],
      played: 0,
      won: 0,
      lost: 0,
      draw: 0,
      points: 0,
      framesFor: 0,
      framesAgainst: 0,
    });
  }
  for (const fixture of fixtures.filter((item) => item.status === "complete")) {
    const homeStats = teamStats.get(fixture.home_team_id);
    const awayStats = teamStats.get(fixture.away_team_id);
    if (!homeStats || !awayStats) continue;
    const homePoints = Number(fixture.home_points ?? 0);
    const awayPoints = Number(fixture.away_points ?? 0);
    homeStats.played += 1;
    awayStats.played += 1;
    homeStats.framesFor += homePoints;
    homeStats.framesAgainst += awayPoints;
    awayStats.framesFor += awayPoints;
    awayStats.framesAgainst += homePoints;
    homeStats.points += homePoints;
    awayStats.points += awayPoints;
    if (homePoints > awayPoints) {
      homeStats.won += 1;
      awayStats.lost += 1;
      homeStats.recent.push("W");
      awayStats.recent.push("L");
    } else if (awayPoints > homePoints) {
      awayStats.won += 1;
      homeStats.lost += 1;
      homeStats.recent.push("L");
      awayStats.recent.push("W");
    } else {
      homeStats.draw += 1;
      awayStats.draw += 1;
      homeStats.recent.push("D");
      awayStats.recent.push("D");
    }
    homeStats.recent = homeStats.recent.slice(-5);
    awayStats.recent = awayStats.recent.slice(-5);
  }

  const tableRows = teams
    .map((team) => {
      const stats = teamStats.get(team.id)!;
      return {
        teamId: team.id,
        points: stats.points,
        frameDiff: stats.framesFor - stats.framesAgainst,
        framesFor: stats.framesFor,
        name: team.name,
      };
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.frameDiff - a.frameDiff ||
        b.framesFor - a.framesFor ||
        a.name.localeCompare(b.name)
    );
  const teamPosition = new Map(tableRows.map((row, index) => [row.teamId, index + 1]));

  const ratingReceiptByFixtureId = new Map<string, ReceiptRow>();
  for (const receipt of receipts) {
    const source = receipt.source_result_id ?? "";
    if (source.startsWith("league_fixture:") && !source.includes(":frame:")) {
      ratingReceiptByFixtureId.set(source.replace("league_fixture:", ""), receipt);
    }
  }

  const weekFixtureIds = new Set(weekFixtures.map((fixture) => fixture.id));
  const weekFrames = frames.filter((frame) => weekFixtureIds.has(frame.fixture_id));

  const fixtureRows = weekFixtures.map((fixture) => {
    const home = teamById.get(fixture.home_team_id) ?? "Home";
    const away = teamById.get(fixture.away_team_id) ?? "Away";
    const homeStats = teamStats.get(fixture.home_team_id)!;
    const awayStats = teamStats.get(fixture.away_team_id)!;
    const homeRating = avg((playersByTeam.get(fixture.home_team_id) ?? []).map((player) => Number(player.rating_snooker ?? 1000)), 1000);
    const awayRating = avg((playersByTeam.get(fixture.away_team_id) ?? []).map((player) => Number(player.rating_snooker ?? 1000)), 1000);
    const homeHcp = avg((playersByTeam.get(fixture.home_team_id) ?? []).map((player) => Number(player.snooker_handicap ?? 0)), 0);
    const awayHcp = avg((playersByTeam.get(fixture.away_team_id) ?? []).map((player) => Number(player.snooker_handicap ?? 0)), 0);
    const homeForm = formScore(homeStats.recent);
    const awayForm = formScore(awayStats.recent);
    const maxTeams = Math.max(2, teamPosition.size);
    const homePos = teamPosition.get(fixture.home_team_id) ?? maxTeams;
    const awayPos = teamPosition.get(fixture.away_team_id) ?? maxTeams;
    const weights = { rating: 0.18, handicap: 1.6, form: 12, table: 3.5, home: 2, scale: 12 };
    const diff =
      (homeRating - awayRating) * weights.rating +
      (awayHcp - homeHcp) * weights.handicap +
      (homeForm - awayForm) * weights.form +
      (awayPos - homePos) * weights.table +
      weights.home;
    const expectedHomeProb = 1 / (1 + Math.exp(-diff / weights.scale));
    const expectedWinner = expectedHomeProb >= 0.5 ? home : away;
    const expectedWinnerPct = Math.round(
      (expectedWinner === home ? expectedHomeProb : 1 - expectedHomeProb) * 100
    );
    const expectedAwayPct = Math.round((1 - expectedHomeProb) * 100);
    const actualHome = Number(fixture.home_points ?? 0);
    const actualAway = Number(fixture.away_points ?? 0);
    const actualWinner = actualHome > actualAway ? home : actualAway > actualHome ? away : "Draw";
    const expectationLabel =
      actualWinner === "Draw"
        ? "The match finished level, so neither side clearly beat the pre-match model."
        : actualWinner === expectedWinner
          ? `${expectedWinner} were the model favourite and the result broadly followed expectation.`
          : `${actualWinner} outperformed the pre-match model and landed the result as an upset on the numbers.`;
    const receipt = ratingReceiptByFixtureId.get(fixture.id) ?? null;
    const meta = receipt?.metadata ?? null;
    const playerDeltas = Array.isArray(meta?.player_deltas) ? meta.player_deltas : [];
    const ratedFrameCount = typeof meta?.rated_frame_count === "number" ? meta.rated_frame_count : 0;
    const biggestGain = playerDeltas
      .filter((row) => typeof row.delta === "number" && row.delta > 0)
      .sort((a, b) => b.delta - a.delta)[0];
    const biggestLoss = playerDeltas
      .filter((row) => typeof row.delta === "number" && row.delta < 0)
      .sort((a, b) => a.delta - b.delta)[0];
    const eloSummary =
      meta?.rating_mode === "per_frame" && playerDeltas.length > 0
        ? `${ratedFrameCount} rated frame${ratedFrameCount === 1 ? "" : "s"} counted. ${biggestGain ? `${playerNameMap.get(biggestGain.player_id) ?? "Player"} made the biggest gain at ${biggestGain.delta >= 0 ? "+" : ""}${biggestGain.delta}. ` : ""}${biggestLoss ? `${playerNameMap.get(biggestLoss.player_id) ?? "Player"} had the biggest drop at ${biggestLoss.delta}.` : ""}`.trim()
        : "Frame-by-frame Elo note will appear here once the rating receipt is attached to this fixture.";

    const frameFacts = weekFrames
      .filter((frame) => frame.fixture_id === fixture.id)
      .sort((a, b) => Number(a.slot_no ?? 0) - Number(b.slot_no ?? 0))
      .map((frame, index) => {
        const homeName =
          [playerNameMap.get(frame.home_player1_id ?? "") ?? null, playerNameMap.get(frame.home_player2_id ?? "") ?? null]
            .filter(Boolean)
            .join(" / ") || "TBC";
        const awayName =
          [playerNameMap.get(frame.away_player1_id ?? "") ?? null, playerNameMap.get(frame.away_player2_id ?? "") ?? null]
            .filter(Boolean)
            .join(" / ") || "TBC";
        const homePoints = typeof frame.home_points_scored === "number" ? frame.home_points_scored : null;
        const awayPoints = typeof frame.away_points_scored === "number" ? frame.away_points_scored : null;

        return {
          label: `${(frame.slot_type ?? "frame").replace(/^./, (match) => match.toUpperCase())} ${frame.slot_no ?? index + 1}`,
          matchup: `${homeName} vs ${awayName}`,
          score: homePoints !== null && awayPoints !== null ? `${homePoints}-${awayPoints}` : "Awaiting score",
          winner: frame.winner_side === "home" ? homeName : frame.winner_side === "away" ? awayName : "No winner recorded",
        };
      });

    return {
      id: fixture.id,
      date: fixture.fixture_date,
      dateLabel: fmtDate(fixture.fixture_date),
      home,
      away,
      score: `${actualHome}-${actualAway}`,
      headline:
        actualHome > actualAway
          ? `${home} beat ${away} ${actualHome}-${actualAway}.`
          : actualAway > actualHome
            ? `${away} beat ${home} ${actualAway}-${actualHome}.`
            : `${home} and ${away} drew ${actualHome}-${actualAway}.`,
      expectedWinner,
      expectedPct: expectedWinnerPct,
      expectedHomePct: Math.round(expectedHomeProb * 100),
      expectedAwayPct,
      expectationLabel,
      eloSummary,
      frameFacts,
    };
  });

  const fixtureUpset = fixtureRows
    .map((fixture) => {
      const actualWinner = fixture.headline.startsWith(fixture.home) ? "home" : fixture.headline.startsWith(fixture.away) ? "away" : "draw";
      const surprise =
        actualWinner === "home"
          ? 1 - fixture.expectedPct / 100
          : actualWinner === "away"
            ? fixture.expectedPct / 100
            : Math.abs(0.5 - fixture.expectedPct / 100);
      return { fixture, actualWinner, surprise };
    })
    .sort((a, b) => b.surprise - a.surprise)[0] ?? null;

  const wins = new Map<string, number>();
  const overperformances: Array<{ text: string; gap: number }> = [];
  for (const frame of weekFrames) {
    if (!frame.winner_side || frame.home_forfeit || frame.away_forfeit) continue;
    const ids =
      frame.winner_side === "home"
        ? [frame.home_player1_id, frame.home_player2_id]
        : [frame.away_player1_id, frame.away_player2_id];
    for (const id of ids) {
      if (!id) continue;
      wins.set(id, (wins.get(id) ?? 0) + 1);
    }

    const homeName =
      [playerNameMap.get(frame.home_player1_id ?? "") ?? null, playerNameMap.get(frame.home_player2_id ?? "") ?? null]
        .filter(Boolean)
        .join(" / ") || "Home";
    const awayName =
      [playerNameMap.get(frame.away_player1_id ?? "") ?? null, playerNameMap.get(frame.away_player2_id ?? "") ?? null]
        .filter(Boolean)
        .join(" / ") || "Away";
    const homeRating =
      frame.slot_type === "doubles"
        ? (Number(playerById.get(frame.home_player1_id ?? "")?.rating_snooker ?? 1000) + Number(playerById.get(frame.home_player2_id ?? "")?.rating_snooker ?? 1000)) / 2
        : Number(playerById.get(frame.home_player1_id ?? "")?.rating_snooker ?? 1000);
    const awayRating =
      frame.slot_type === "doubles"
        ? (Number(playerById.get(frame.away_player1_id ?? "")?.rating_snooker ?? 1000) + Number(playerById.get(frame.away_player2_id ?? "")?.rating_snooker ?? 1000)) / 2
        : Number(playerById.get(frame.away_player1_id ?? "")?.rating_snooker ?? 1000);
    const winnerName = frame.winner_side === "home" ? homeName : awayName;
    const ratingGap = frame.winner_side === "home" ? awayRating - homeRating : homeRating - awayRating;
    if (ratingGap > 0) {
      overperformances.push({
        text: `${winnerName} delivered the standout frame over-performance of the week, beating an opponent rated ${Math.round(ratingGap)} Elo points higher.`,
        gap: ratingGap,
      });
    }
  }

  const star = Array.from(wins.entries()).sort((a, b) => b[1] - a[1])[0];
  const topOverperformance = overperformances.sort((a, b) => b.gap - a.gap)[0] ?? null;

  return {
    season,
    week: selectedWeek,
    summary: {
      title: `Week ${selectedWeek} Round-up`,
      eloNote:
        "Corrected frame-by-frame Elo is used here, so players were rated from their own frames rather than the overall team result.",
      upset:
        fixtureUpset && fixtureUpset.actualWinner !== "draw"
          ? `${fixtureUpset.fixture.headline.split(".")[0]} Before the match, the winner's chance on the model was about ${fixtureUpset.fixture.expectedPct}%.`
          : "No result this week stood out as a major upset against the model.",
      overperformance: topOverperformance?.text ?? "No individual frame winner produced a major frame-by-frame Elo upset this week.",
      star: star
        ? `${playerNameMap.get(star[0]) ?? "Player"} was standout with ${star[1]} frame win${star[1] === 1 ? "" : "s"}.`
        : "No standout player recorded this week yet.",
      lines: fixtureRows.map((fixture) => `${fixture.home} ${fixture.score} ${fixture.away}`),
    },
    fixtures: fixtureRows,
  };
}

export async function buildPublicWeeklyHandicapReview(adminClient: SupabaseClient) {
  const season = await getLatestPublishedSeason(adminClient);
  if (!season) {
    return {
      season: null,
      batchTime: null,
      week: null,
      changes: [],
    };
  }

  const [fixturesRes, framesRes, playersRes, teamMembersRes] = await Promise.all([
    adminClient
      .from("league_fixtures")
      .select("id,season_id,fixture_date,week_no,status")
      .eq("season_id", season.id)
      .order("fixture_date", { ascending: true }),
    adminClient
      .from("league_fixture_frames")
      .select("fixture_id,slot_no,slot_type,home_player1_id,home_player2_id,away_player1_id,away_player2_id"),
    adminClient
      .from("players")
      .select("id,display_name,full_name,rating_snooker,snooker_handicap,snooker_handicap_base")
      .eq("is_archived", false),
    adminClient.from("league_registered_team_members").select("player_id"),
  ]);

  const firstError =
    fixturesRes.error?.message ||
    framesRes.error?.message ||
    playersRes.error?.message ||
    teamMembersRes.error?.message;
  if (firstError) throw new Error(firstError);

  const fixtures = (fixturesRes.data ?? []) as FixtureRow[];
  const frames = (framesRes.data ?? []) as ReviewFrameRow[];
  const completeWeeks = Array.from(
    new Set(
      fixtures
        .filter((fixture) => fixture.week_no !== null)
        .map((fixture) => fixture.week_no as number)
        .filter((week) =>
          fixtures
            .filter((fixture) => fixture.week_no === week)
            .every((fixture) => fixture.status === "complete")
        )
    )
  ).sort((a, b) => b - a);
  const selectedWeek = completeWeeks[0] ?? null;
  const leaguePlayerIds = new Set(
    (teamMembersRes.data ?? []).map((row) => row.player_id).filter(Boolean)
  );
  const players = (playersRes.data ?? []) as Array<PlayerRow & { snooker_handicap_base: number | null }>;

  if (!selectedWeek) {
    return {
      season,
      batchTime: null,
      week: null,
      changes: [],
    };
  }

  const weekFixtures = fixtures.filter((fixture) => fixture.week_no === selectedWeek);
  const fixtureIds = new Set(weekFixtures.map((fixture) => fixture.id));
  const weekFrames = frames.filter((frame) => fixtureIds.has(frame.fixture_id));
  const weekFrameSourceIds = frames
    .filter((frame) => fixtureIds.has(frame.fixture_id) && Number.isInteger(frame.slot_no))
    .map((frame) => `league_fixture:${frame.fixture_id}:frame:${frame.slot_no}`);
  const latestBatchTime = weekFixtures
    .map((fixture) => fixture.fixture_date)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] ?? null;

  const eventsRes =
    weekFrameSourceIds.length > 0
      ? await adminClient
          .from("rating_events")
          .select("player_id,rating_delta,source_result_id")
          .eq("source_app", "league")
          .in("source_result_id", weekFrameSourceIds)
      : { data: [], error: null };
  if (eventsRes.error) throw new Error(eventsRes.error.message);

  const deltaByPlayer = new Map<string, number>();
  const ratedFramesByPlayer = new Map<string, number>();
  const eventsByPlayer = new Map<string, RatingEventRow[]>();
  for (const event of (eventsRes.data ?? []) as RatingEventRow[]) {
    if (!event.player_id) continue;
    const currentDelta = deltaByPlayer.get(event.player_id) ?? 0;
    deltaByPlayer.set(event.player_id, currentDelta + Number(event.rating_delta ?? 0));
    ratedFramesByPlayer.set(
      event.player_id,
      (ratedFramesByPlayer.get(event.player_id) ?? 0) + 1
    );
    const bucket = eventsByPlayer.get(event.player_id) ?? [];
    bucket.push(event);
    eventsByPlayer.set(event.player_id, bucket);
  }

  const frameBySourceId = new Map<string, ReviewFrameRow>(
    weekFrames
      .filter((frame) => Number.isInteger(frame.slot_no))
      .map((frame) => [`league_fixture:${frame.fixture_id}:frame:${frame.slot_no}`, frame] as const)
  );

  const changes = players
    .filter((player) => leaguePlayerIds.has(player.id))
    .map((player) => {
      const currentHandicap = Number(player.snooker_handicap ?? 0);
      const currentRating = Math.round(Number(player.rating_snooker ?? 1000));
      const delta = Math.round(deltaByPlayer.get(player.id) ?? 0);
      const startingRating = currentRating - delta;
      const target = targetHandicapFromElo(currentRating);
      const ratedFrames = ratedFramesByPlayer.get(player.id) ?? 0;
      const name = named(player);
      const frameEvents = eventsByPlayer.get(player.id) ?? [];
      const perFrameNotes = frameEvents
        .map((event) => {
          const frame = frameBySourceId.get(event.source_result_id ?? "");
          const deltaValue = Math.round(Number(event.rating_delta ?? 0));
          if (!frame) return null;
          const isHome = [frame.home_player1_id, frame.home_player2_id].includes(player.id);
          const ownIds = (
            isHome
              ? [frame.home_player1_id, frame.home_player2_id]
              : [frame.away_player1_id, frame.away_player2_id]
          ).filter(Boolean) as string[];
          const oppIds = (
            isHome
              ? [frame.away_player1_id, frame.away_player2_id]
              : [frame.home_player1_id, frame.home_player2_id]
          ).filter(Boolean) as string[];
          const ownStartRating = Math.round(
            avg(
              ownIds.map((id) => {
                const p = players.find((item) => item.id === id);
                const playerDelta = Math.round(deltaByPlayer.get(id) ?? 0);
                return Math.round(Number(p?.rating_snooker ?? 1000)) - playerDelta;
              }),
              startingRating
            )
          );
          const oppStartRating = Math.round(
            avg(
              oppIds.map((id) => {
                const p = players.find((item) => item.id === id);
                const playerDelta = Math.round(deltaByPlayer.get(id) ?? 0);
                return Math.round(Number(p?.rating_snooker ?? 1000)) - playerDelta;
              }),
              1000
            )
          );
          const ratingGap = Math.abs(oppStartRating - ownStartRating);
          const opponentNames = oppIds
            .map((id) => named(players.find((item) => item.id === id)))
            .filter(Boolean)
            .join(" / ");
          let explanation = "This frame was close to rating expectation, so the Elo swing stayed modest.";
          if (deltaValue > 0 && oppStartRating > ownStartRating) {
            explanation = `Frame ${frame.slot_no} vs ${opponentNames} brought a stronger gain because the opposition started about ${ratingGap} Elo higher.`;
          } else if (deltaValue > 0 && oppStartRating < ownStartRating) {
            explanation = `Frame ${frame.slot_no} vs ${opponentNames} brought a smaller gain because the opposition started about ${ratingGap} Elo lower.`;
          } else if (deltaValue < 0 && oppStartRating < ownStartRating) {
            explanation = `Frame ${frame.slot_no} vs ${opponentNames} caused a sharper drop because the opposition started about ${ratingGap} Elo lower.`;
          } else if (deltaValue < 0 && oppStartRating > ownStartRating) {
            explanation = `Frame ${frame.slot_no} vs ${opponentNames} caused a smaller drop because the opposition started about ${ratingGap} Elo higher.`;
          } else if (deltaValue > 0) {
            explanation = `Frame ${frame.slot_no} vs ${opponentNames} produced a positive Elo swing in a fairly even matchup.`;
          } else if (deltaValue < 0) {
            explanation = `Frame ${frame.slot_no} vs ${opponentNames} produced a negative Elo swing in a fairly even matchup.`;
          }
          return {
            deltaValue,
            slotNo: frame.slot_no ?? 0,
            frameLabel: `Frame ${frame.slot_no}`,
            explanation,
          };
        })
        .filter((item): item is { deltaValue: number; slotNo: number; frameLabel: string; explanation: string } => Boolean(item))
        .sort((a, b) => a.slotNo - b.slotNo);
      const frameSummary =
        perFrameNotes.length > 0
          ? perFrameNotes.map((note) => note.explanation).join(" ")
          : "";
      return {
        playerId: player.id,
        name,
        playedOff: currentHandicap,
        previous: startingRating,
        next: currentRating,
        current: currentHandicap,
        baseline: Number(player.snooker_handicap_base ?? currentHandicap),
        rating: currentRating,
        target,
        changedThisWeek: delta !== 0,
        ratedFrames,
        reason:
          delta > 0
            ? `${name} moved from ${startingRating} to ${currentRating}, gaining ${delta} Elo from ${ratedFrames} rated frame${ratedFrames === 1 ? "" : "s"} this week. ${frameSummary ? `${frameSummary} ` : ""}The current playing handicap is ${formatSigned(currentHandicap)}, linked to the ${formatSigned(target)} Elo target handicap band.`
            : delta < 0
              ? `${name} moved from ${startingRating} to ${currentRating}, losing ${Math.abs(delta)} Elo from ${ratedFrames} rated frame${ratedFrames === 1 ? "" : "s"} this week. ${frameSummary ? `${frameSummary} ` : ""}The current playing handicap is ${formatSigned(currentHandicap)}, linked to the ${formatSigned(target)} Elo target handicap band.`
              : `${name} stayed at ${currentRating} Elo this week with no Elo movement recorded. The current playing handicap is ${formatSigned(currentHandicap)}, linked to the ${formatSigned(target)} Elo target handicap band.`,
      };
    })
    .filter((row) => row.ratedFrames > 0 || row.changedThisWeek)
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));

  return {
    season,
    batchTime: latestBatchTime,
    week: selectedWeek,
    changes,
  };
}

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}
