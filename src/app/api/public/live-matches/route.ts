import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateAdjustedScoresWithCap, MAX_SNOOKER_START } from "@/lib/snooker-handicap";

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
  pre_match_paper_record?: boolean | null;
  home_lineup_submitted_at?: string | null;
  away_lineup_submitted_at?: string | null;
};

type FrameRow = {
  id: string;
  fixture_id: string;
  slot_no: number;
  slot_type: "singles" | "doubles";
  home_player1_id: string | null;
  home_player2_id: string | null;
  away_player1_id: string | null;
  away_player2_id: string | null;
  home_nominated: boolean | null;
  away_nominated: boolean | null;
  home_nominated_name?: string | null;
  away_nominated_name?: string | null;
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
  avatar_url?: string | null;
  snooker_handicap?: number | null;
  nationality_name?: string | null;
  country_code?: string | null;
};

type PlayerSelectRow = {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url?: string | null;
  snooker_handicap?: number | null;
  nationality_name?: string | null;
  country_code?: string | null;
};

type PublicPlayerCard = {
  name: string;
  avatarUrl: string | null;
  nationality: string | null;
  countryCode: string | null;
};

function publicPlayerCard(player?: PlayerRow | null, fallbackName?: string): PublicPlayerCard {
  return {
    name: player?.full_name?.trim() || player?.display_name || fallbackName || "Player",
    avatarUrl: player?.avatar_url ?? null,
    nationality: player?.nationality_name ?? null,
    countryCode: player?.country_code ?? null,
  };
}

function named(player?: PlayerRow | null) {
  return player?.full_name?.trim() || player?.display_name || "Unknown";
}

function formatHandicap(value: number) {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function playerHandicap(player?: PlayerRow | null) {
  return Number(player?.snooker_handicap ?? 0);
}

function playerLabel(player?: PlayerRow | null, fallbackName?: string) {
  const label = player?.full_name?.trim() || player?.display_name || fallbackName || "Player";
  if (!player) return label;
  return `${label} (${formatHandicap(playerHandicap(player))})`;
}

function doublesPlayerLabel(player: PlayerRow | null | undefined, fallbackName: string) {
  return playerLabel(player, fallbackName);
}

function formatStartDetail(homeStart: number, awayStart: number) {
  if (homeStart > 0) return { recipient: "Home", amount: homeStart, label: `Home receives ${homeStart}` };
  if (awayStart > 0) return { recipient: "Away", amount: awayStart, label: `Away receives ${awayStart}` };
  return { recipient: "Level", amount: 0, label: "Level start" };
}

function isMissingColumnError(message?: string | null) {
  const lower = (message ?? "").toLowerCase();
  return lower.includes("column") && lower.includes("does not exist");
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
    return NextResponse.json({ season: null, liveMatches: [] });
  }

  const [teamsRes, fixturesRes, framesRes, playersQueryRes] = await Promise.all([
    adminClient.from("league_teams").select("id,season_id,name").eq("season_id", selectedSeason.id),
    adminClient
      .from("league_fixtures")
      .select(
        "id,season_id,fixture_date,week_no,home_team_id,away_team_id,status,pre_match_paper_record,home_lineup_submitted_at,away_lineup_submitted_at"
      )
      .eq("season_id", selectedSeason.id)
      .order("fixture_date", { ascending: true }),
    adminClient
      .from("league_fixture_frames")
      .select(
        "id,fixture_id,slot_no,slot_type,home_player1_id,home_player2_id,away_player1_id,away_player2_id,home_nominated,away_nominated,home_nominated_name,away_nominated_name,home_forfeit,away_forfeit,winner_side,home_points_scored,away_points_scored"
      ),
    adminClient
      .from("players")
      .select("id,display_name,full_name,avatar_url,snooker_handicap,nationality_name,country_code")
      .eq("is_archived", false),
  ]);

  let playersData = (playersQueryRes.data ?? []) as PlayerSelectRow[];
  let playersError = playersQueryRes.error?.message ?? null;
  if (playersQueryRes.error && isMissingColumnError(playersQueryRes.error.message)) {
    const fallbackPlayersRes = await adminClient
      .from("players")
      .select("id,display_name,full_name,avatar_url,snooker_handicap")
      .eq("is_archived", false);
    playersData = ((fallbackPlayersRes.data ?? []) as Array<{
      id: string;
      display_name: string;
      full_name: string | null;
      avatar_url?: string | null;
      snooker_handicap?: number | null;
    }>).map((row) => ({
      ...row,
      nationality_name: null,
      country_code: null,
    }));
    playersError = fallbackPlayersRes.error?.message ?? null;
  }

  const firstError = teamsRes.error?.message || fixturesRes.error?.message || framesRes.error?.message || playersError;
  if (firstError) {
    return NextResponse.json({ error: firstError }, { status: 500 });
  }

  const teams = (teamsRes.data ?? []) as TeamRow[];
  const fixtures = ((fixturesRes.data ?? []) as FixtureRow[]).filter((fixture) => fixture.season_id === selectedSeason.id);
  const frames = (framesRes.data ?? []) as FrameRow[];
  const players = playersData as PlayerRow[];

  const teamById = new Map(teams.map((team) => [team.id, team]));
  const playerById = new Map(players.map((player) => [player.id, player]));

  const matchNightCandidates = fixtures.filter((fixture) => {
    if (fixture.pre_match_paper_record) return false;
    if (fixture.status === "complete") return false;
    return Boolean(fixture.home_lineup_submitted_at) && Boolean(fixture.away_lineup_submitted_at);
  });

  const currentMatchNightDate =
    [...new Set(matchNightCandidates.map((fixture) => fixture.fixture_date).filter((value): value is string => Boolean(value)))]
      .sort((a, b) => b.localeCompare(a))[0] ?? null;

  const liveFixtures = matchNightCandidates
    .filter((fixture) => (currentMatchNightDate ? fixture.fixture_date === currentMatchNightDate : true))
    .sort((a, b) => {
      const statusRank = (status: FixtureRow["status"]) =>
        status === "in_progress" ? 0 : 1;
      const aDate = a.fixture_date ?? "9999-12-31";
      const bDate = b.fixture_date ?? "9999-12-31";
      return (
        aDate.localeCompare(bDate) ||
        (a.week_no ?? 999) - (b.week_no ?? 999) ||
        statusRank(a.status) - statusRank(b.status)
      );
    });

  const liveMatches = liveFixtures.map((fixture) => {
    const fixtureFrames = frames.filter((frame) => frame.fixture_id === fixture.id).sort((a, b) => a.slot_no - b.slot_no);
    const homeFramesWon = fixtureFrames.filter((frame) => frame.winner_side === "home").length;
    const awayFramesWon = fixtureFrames.filter((frame) => frame.winner_side === "away").length;
    const effectiveStatus =
      fixture.status === "pending" &&
      fixture.home_lineup_submitted_at &&
      fixture.away_lineup_submitted_at
        ? "in_progress"
        : fixture.status;

    const frameRows = fixtureFrames.map((frame) => {
      const homePrimary = frame.home_player1_id ? playerById.get(frame.home_player1_id) : null;
      const awayPrimary = frame.away_player1_id ? playerById.get(frame.away_player1_id) : null;
      const homeSecondary = frame.home_player2_id ? playerById.get(frame.home_player2_id) : null;
      const awaySecondary = frame.away_player2_id ? playerById.get(frame.away_player2_id) : null;

      const homeName =
        frame.slot_type === "doubles"
          ? `${doublesPlayerLabel(homePrimary, "Home player 1")} / ${doublesPlayerLabel(homeSecondary, "Home player 2")}`
          : frame.home_nominated
            ? `${frame.home_nominated_name?.trim() || "Nominated Player"} (N)`
            : playerLabel(homePrimary, frame.home_forfeit ? "No show" : "Home player");
      const awayName =
        frame.slot_type === "doubles"
          ? `${doublesPlayerLabel(awayPrimary, "Away player 1")} / ${doublesPlayerLabel(awaySecondary, "Away player 2")}`
          : frame.away_nominated
            ? `${frame.away_nominated_name?.trim() || "Nominated Player"} (N)`
            : playerLabel(awayPrimary, frame.away_forfeit ? "No show" : "Away player");

      const homeHandicap =
        frame.slot_type === "doubles"
          ? (playerHandicap(homePrimary) + playerHandicap(homeSecondary)) / 2
          : playerHandicap(homePrimary);
      const awayHandicap =
        frame.slot_type === "doubles"
          ? (playerHandicap(awayPrimary) + playerHandicap(awaySecondary)) / 2
          : playerHandicap(awayPrimary);
      const starts = calculateAdjustedScoresWithCap(0, 0, homeHandicap, awayHandicap);
      const startDetail = formatStartDetail(starts.homeStart, starts.awayStart);

      const homeScore = typeof frame.home_points_scored === "number" ? frame.home_points_scored : null;
      const awayScore = typeof frame.away_points_scored === "number" ? frame.away_points_scored : null;
      const hasScore = homeScore !== null || awayScore !== null;
      const scoreLabel = hasScore ? `${homeScore ?? 0}-${awayScore ?? 0}` : "Awaiting score";
      const frameStatus = frame.winner_side
        ? frame.winner_side === "home"
          ? "Home won"
          : "Away won"
        : hasScore
          ? "In progress"
          : "Lineup ready";

      return {
        id: frame.id,
        slotNo: frame.slot_no,
        slotType: frame.slot_type,
        title: `Frame ${frame.slot_no}`,
        homeName,
        awayName,
        homeHandicapLabel:
          frame.slot_type === "doubles"
            ? `${formatHandicap(Math.round(homeHandicap))}`
            : `${formatHandicap(playerHandicap(homePrimary))}`,
        awayHandicapLabel:
          frame.slot_type === "doubles"
            ? `${formatHandicap(Math.round(awayHandicap))}`
            : `${formatHandicap(playerHandicap(awayPrimary))}`,
        homePlayers:
          frame.slot_type === "doubles"
            ? [
                publicPlayerCard(homePrimary, "Home player 1"),
                publicPlayerCard(homeSecondary, "Home player 2"),
              ]
            : [
                publicPlayerCard(homePrimary, frame.home_nominated ? frame.home_nominated_name?.trim() || "Nominated Player" : "Home player"),
              ],
        awayPlayers:
          frame.slot_type === "doubles"
            ? [
                publicPlayerCard(awayPrimary, "Away player 1"),
                publicPlayerCard(awaySecondary, "Away player 2"),
              ]
            : [
                publicPlayerCard(awayPrimary, frame.away_nominated ? frame.away_nominated_name?.trim() || "Nominated Player" : "Away player"),
              ],
        scoreLabel,
        frameStatus,
        startLabel: `Max start ${MAX_SNOOKER_START} · ${startDetail.label}`,
        startRecipient: startDetail.recipient,
        startAmount: startDetail.amount,
      };
    });

    return {
      fixtureId: fixture.id,
      fixtureDate: fixture.fixture_date,
      weekNo: fixture.week_no,
      status: effectiveStatus,
      homeTeam: teamById.get(fixture.home_team_id)?.name ?? "Home team",
      awayTeam: teamById.get(fixture.away_team_id)?.name ?? "Away team",
      overallScore: `${homeFramesWon} - ${awayFramesWon}`,
      frameRows,
    };
  });

  return NextResponse.json({
    season: {
      id: selectedSeason.id,
      name: selectedSeason.name,
    },
    liveMatches,
  });
}
