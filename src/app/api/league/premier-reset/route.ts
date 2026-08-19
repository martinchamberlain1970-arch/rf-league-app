import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireLeagueManager } from "@/lib/server-role";
import { logServerAudit } from "@/lib/server-audit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type ResetPlayer = {
  id: string;
  full_name: string | null;
  display_name: string;
  rating_snooker: number | null;
  peak_rating_snooker: number | null;
  rated_matches_snooker: number | null;
  snooker_handicap: number | null;
  snooker_handicap_base: number | null;
};
type SeasonRow = {
  id: string;
  name: string;
  is_published: boolean | null;
  is_active: boolean | null;
  handicap_enabled: boolean | null;
  handicap_max_start: number | null;
};
type MemberRow = { player_id: string | null };
type FixtureRow = { id: string; status: string | null };

async function authorize(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) throw new Error("SERVER_NOT_CONFIGURED");
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) throw new Error("UNAUTHORIZED");
  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const authRes = await authClient.auth.getUser(token);
  if (authRes.error || !authRes.data.user) throw new Error("UNAUTHORIZED");
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const role = await requireLeagueManager(adminClient, authRes.data.user);
  return { adminClient, user: authRes.data.user, role };
}

async function loadResetScope(adminClient: SupabaseClient, seasonId: string) {
  const seasonRes = await adminClient
    .from("league_seasons")
    .select("id,name,is_published,is_active,handicap_enabled,handicap_max_start")
    .eq("id", seasonId)
    .maybeSingle();
  if (seasonRes.error) throw new Error(seasonRes.error.message);
  const season = seasonRes.data as SeasonRow | null;
  if (!season) throw new Error("SEASON_NOT_FOUND");
  if (!/premier league/i.test(season.name)) throw new Error("NOT_PREMIER");

  const [membersRes, fixturesRes] = await Promise.all([
    adminClient.from("league_team_members").select("player_id").eq("season_id", seasonId),
    adminClient.from("league_fixtures").select("id,status").eq("season_id", seasonId),
  ]);
  if (membersRes.error) throw new Error(membersRes.error.message);
  if (fixturesRes.error) throw new Error(fixturesRes.error.message);

  const members = (membersRes.data ?? []) as MemberRow[];
  const fixtures = (fixturesRes.data ?? []) as FixtureRow[];
  const playerIds = Array.from(new Set(members.map((row) => row.player_id).filter(Boolean))) as string[];
  let players: ResetPlayer[] = [];
  if (playerIds.length > 0) {
    const playersRes = await adminClient
      .from("players")
      .select("id,full_name,display_name,rating_snooker,peak_rating_snooker,rated_matches_snooker,snooker_handicap,snooker_handicap_base")
      .in("id", playerIds);
    if (playersRes.error) throw new Error(playersRes.error.message);
    players = (playersRes.data ?? []) as ResetPlayer[];
  }

  const needsReset = players.filter(
    (player) =>
      Number(player.rating_snooker ?? 1000) !== 1000 ||
      Number(player.peak_rating_snooker ?? 1000) !== 1000 ||
      Number(player.rated_matches_snooker ?? 0) !== 0 ||
      Number(player.snooker_handicap ?? 0) !== 0 ||
      Number(player.snooker_handicap_base ?? 0) !== 0
  );
  const startedFixtures = fixtures.filter((fixture) => fixture.status === "in_progress" || fixture.status === "complete");

  return {
    season,
    players,
    needsReset,
    fixtureCount: fixtures.length,
    startedFixtureCount: startedFixtures.length,
  };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  if (message === "SERVER_NOT_CONFIGURED") return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (message === "FORBIDDEN_LEAGUE_MANAGER") return NextResponse.json({ error: "League management access is required." }, { status: 403 });
  if (message === "SEASON_NOT_FOUND") return NextResponse.json({ error: "League season not found." }, { status: 404 });
  if (message === "NOT_PREMIER") return NextResponse.json({ error: "The opening reset can only be applied to a Premier League season." }, { status: 400 });
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(req: NextRequest) {
  try {
    const seasonId = req.nextUrl.searchParams.get("seasonId")?.trim() ?? "";
    if (!seasonId) return NextResponse.json({ error: "seasonId is required." }, { status: 400 });
    const { adminClient } = await authorize(req);
    const scope = await loadResetScope(adminClient, seasonId);
    return NextResponse.json({
      season: scope.season,
      totalPlayers: scope.players.length,
      needsReset: scope.needsReset.length,
      alreadyAtBaseline: scope.players.length - scope.needsReset.length,
      fixtureCount: scope.fixtureCount,
      startedFixtureCount: scope.startedFixtureCount,
      players: scope.needsReset.map((player) => ({
        id: player.id,
        name: player.full_name?.trim() || player.display_name,
        elo: Math.round(Number(player.rating_snooker ?? 1000)),
        handicap: Number(player.snooker_handicap ?? 0),
        ratedMatches: Number(player.rated_matches_snooker ?? 0),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const seasonId = typeof body.seasonId === "string" ? body.seasonId.trim() : "";
    if (!seasonId || body.confirmation !== "RESET PREMIER") {
      return NextResponse.json({ error: "A confirmed Premier reset request is required." }, { status: 400 });
    }

    const { adminClient, user, role } = await authorize(req);
    const scope = await loadResetScope(adminClient, seasonId);
    if (scope.startedFixtureCount > 0) {
      return NextResponse.json(
        { error: "This Premier season already has in-progress or completed fixtures. The opening reset has been blocked." },
        { status: 409 }
      );
    }
    if (scope.players.length === 0) {
      return NextResponse.json({ error: "Add the Premier player rosters before running the opening reset." }, { status: 400 });
    }
    if (scope.needsReset.length === 0) {
      return NextResponse.json({ ok: true, reset: 0, message: "Every Premier player is already at the opening baseline." });
    }

    const resetIds = scope.needsReset.map((player) => player.id);
    const updateRes = await adminClient
      .from("players")
      .update({
        rating_snooker: 1000,
        peak_rating_snooker: 1000,
        rated_matches_snooker: 0,
        snooker_handicap: 0,
        snooker_handicap_base: 0,
      })
      .in("id", resetIds);
    if (updateRes.error) throw new Error(updateRes.error.message);

    const historyRes = await adminClient.from("league_handicap_history").insert(
      scope.needsReset.map((player) => ({
        player_id: player.id,
        season_id: seasonId,
        change_type: "baseline_override",
        delta: 0 - Number(player.snooker_handicap ?? 0),
        previous_handicap: Number(player.snooker_handicap ?? 0),
        new_handicap: 0,
        reason: `${scope.season.name} opening reset: Elo 1000 and handicap 0. Historic rating events retained.`,
        changed_by_user_id: user.id,
      }))
    );
    if (historyRes.error) throw new Error(`Players were reset, but handicap history could not be recorded: ${historyRes.error.message}`);

    await logServerAudit(adminClient, {
      actorUserId: user.id,
      actorEmail: user.email ?? null,
      actorRole: role,
      action: "league.premier_opening_reset",
      entityType: "league_season",
      entityId: seasonId,
      summary: `Reset ${scope.needsReset.length} Premier player(s) to Elo 1000 and handicap 0.`,
      meta: {
        season_name: scope.season.name,
        player_ids: resetIds,
        historic_rating_events_retained: true,
      },
    });

    return NextResponse.json({
      ok: true,
      reset: scope.needsReset.length,
      message: `${scope.needsReset.length} Premier player${scope.needsReset.length === 1 ? "" : "s"} reset to Elo 1000 and handicap 0.`,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
