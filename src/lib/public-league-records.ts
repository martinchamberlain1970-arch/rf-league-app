import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type PublicSeason = { id: string; name: string };
export type PublicTeam = { id: string; name: string };
export type PublicPlayer = {
  id: string;
  name: string;
  rating: number;
  handicap: number;
};
export type PublicFixtureRecord = {
  id: string;
  fixtureDate: string | null;
  weekNo: number | null;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: string;
  awayTeam: string;
  status: "pending" | "in_progress" | "complete" | "bye";
  homePoints: number | null;
  awayPoints: number | null;
};
export type PublicFrameRecord = {
  fixtureId: string;
  slotNo: number;
  slotType: "singles" | "doubles";
  winnerSide: "home" | "away" | null;
  homePlayer1Id: string | null;
  homePlayer2Id: string | null;
  awayPlayer1Id: string | null;
  awayPlayer2Id: string | null;
  homeForfeit: boolean;
  awayForfeit: boolean;
  homeNominated: boolean;
  awayNominated: boolean;
  homePoints: number | null;
  awayPoints: number | null;
};

type SeasonRow = { id: string; name: string; is_published: boolean | null; is_active: boolean | null };
type TeamRow = { id: string; name: string; is_active: boolean | null };
type MemberRow = { team_id: string; player_id: string };
type PlayerRow = {
  id: string;
  display_name: string;
  full_name: string | null;
  rating_snooker: number | null;
  snooker_handicap: number | null;
};
type FixtureRow = {
  id: string;
  fixture_date: string | null;
  week_no: number | null;
  home_team_id: string;
  away_team_id: string;
  status: "pending" | "in_progress" | "complete" | "bye";
  home_points: number | null;
  away_points: number | null;
};
type FrameRow = {
  fixture_id: string;
  slot_no: number;
  slot_type: "singles" | "doubles";
  winner_side: "home" | "away" | null;
  home_player1_id: string | null;
  home_player2_id: string | null;
  away_player1_id: string | null;
  away_player2_id: string | null;
  home_forfeit: boolean | null;
  away_forfeit: boolean | null;
  home_nominated: boolean | null;
  away_nominated: boolean | null;
  home_points_scored: number | null;
  away_points_scored: number | null;
};

export type PublicLeagueRecordContext = {
  season: PublicSeason;
  teams: PublicTeam[];
  members: MemberRow[];
  players: PublicPlayer[];
  fixtures: PublicFixtureRecord[];
  frames: PublicFrameRecord[];
};

function playerName(row: PlayerRow) {
  return row.full_name?.trim() || row.display_name || "Player";
}

export async function loadPublicLeagueRecordContext(seasonId: string): Promise<PublicLeagueRecordContext> {
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Server configuration missing.");
  if (!seasonId) throw new Error("Choose a published league season.");

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const seasonRes = await admin
    .from("league_seasons")
    .select("id,name,is_published,is_active")
    .eq("id", seasonId)
    .eq("is_published", true)
    .eq("is_active", true)
    .maybeSingle();
  if (seasonRes.error) throw new Error(seasonRes.error.message);
  if (!seasonRes.data) throw new Error("This league is not currently published and live.");

  const [teamsRes, membersRes, fixturesRes, playersRes] = await Promise.all([
    admin.from("league_teams").select("id,name,is_active").eq("season_id", seasonId),
    admin.from("league_team_members").select("team_id,player_id").eq("season_id", seasonId),
    admin
      .from("league_fixtures")
      .select("id,fixture_date,week_no,home_team_id,away_team_id,status,home_points,away_points")
      .eq("season_id", seasonId)
      .order("week_no", { ascending: true })
      .order("fixture_date", { ascending: true }),
    admin
      .from("players")
      .select("id,display_name,full_name,rating_snooker,snooker_handicap")
      .eq("is_archived", false),
  ]);
  const firstError = teamsRes.error?.message || membersRes.error?.message || fixturesRes.error?.message || playersRes.error?.message;
  if (firstError) throw new Error(firstError);

  const teamRows = ((teamsRes.data ?? []) as TeamRow[]).filter((team) => team.is_active !== false);
  const activeTeamIds = new Set(teamRows.map((team) => team.id));
  const teamById = new Map(teamRows.map((team) => [team.id, team.name]));
  const fixtureRows = ((fixturesRes.data ?? []) as FixtureRow[]).filter(
    (fixture) => activeTeamIds.has(fixture.home_team_id) && activeTeamIds.has(fixture.away_team_id)
  );
  const fixtureIds = fixtureRows.map((fixture) => fixture.id);
  const framesRes = fixtureIds.length
    ? await admin
        .from("league_fixture_frames")
        .select("fixture_id,slot_no,slot_type,winner_side,home_player1_id,home_player2_id,away_player1_id,away_player2_id,home_forfeit,away_forfeit,home_nominated,away_nominated,home_points_scored,away_points_scored")
        .in("fixture_id", fixtureIds)
        .order("slot_no", { ascending: true })
    : { data: [], error: null };
  if (framesRes.error) throw new Error(framesRes.error.message);

  return {
    season: { id: (seasonRes.data as SeasonRow).id, name: (seasonRes.data as SeasonRow).name },
    teams: teamRows.map((team) => ({ id: team.id, name: team.name })),
    members: ((membersRes.data ?? []) as MemberRow[]).filter((member) => activeTeamIds.has(member.team_id)),
    players: ((playersRes.data ?? []) as PlayerRow[]).map((player) => ({
      id: player.id,
      name: playerName(player),
      rating: Number(player.rating_snooker ?? 1000),
      handicap: Number(player.snooker_handicap ?? 0),
    })),
    fixtures: fixtureRows.map((fixture) => ({
      id: fixture.id,
      fixtureDate: fixture.fixture_date,
      weekNo: fixture.week_no,
      homeTeamId: fixture.home_team_id,
      awayTeamId: fixture.away_team_id,
      homeTeam: teamById.get(fixture.home_team_id) ?? "Home team",
      awayTeam: teamById.get(fixture.away_team_id) ?? "Away team",
      status: fixture.status,
      homePoints: fixture.home_points,
      awayPoints: fixture.away_points,
    })),
    frames: ((framesRes.data ?? []) as FrameRow[]).map((frame) => ({
      fixtureId: frame.fixture_id,
      slotNo: Number(frame.slot_no),
      slotType: frame.slot_type,
      winnerSide: frame.winner_side,
      homePlayer1Id: frame.home_player1_id,
      homePlayer2Id: frame.home_player2_id,
      awayPlayer1Id: frame.away_player1_id,
      awayPlayer2Id: frame.away_player2_id,
      homeForfeit: Boolean(frame.home_forfeit),
      awayForfeit: Boolean(frame.away_forfeit),
      homeNominated: Boolean(frame.home_nominated),
      awayNominated: Boolean(frame.away_nominated),
      homePoints: frame.home_points_scored,
      awayPoints: frame.away_points_scored,
    })),
  };
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
