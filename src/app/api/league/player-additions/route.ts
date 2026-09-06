import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canManageLeagueRole } from "@/lib/app-roles";
import { normalizePlayerName } from "@/lib/player-name-match";
import { resolveServerRole } from "@/lib/server-role";
import { sendPushToLeagueManagers } from "@/lib/push-server";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const noStore = { "Cache-Control": "no-store, max-age=0" };

function registrationDeadline(seasonName: string) {
  const match = seasonName.match(/\b(20\d{2})(?:\s*\/\s*(?:20)?\d{2})?\b/);
  const year = match ? Number(match[1]) : new Date().getUTCFullYear();
  return `${year}-12-31T23:59:59.999Z`;
}

function friendlyError(message: string) {
  return message.includes("league_player_addition_requests")
    ? "Player-addition requests are not installed yet. Run the latest Supabase migration, then reload this screen."
    : message;
}

async function contextFor(req: NextRequest) {
  if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Server is not configured.");
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("UNAUTHORIZED");
  const authClient = createClient(supabaseUrl, anonKey);
  const authRes = await authClient.auth.getUser(token);
  if (authRes.error || !authRes.data.user) throw new Error("UNAUTHORIZED");
  const admin = createClient(supabaseUrl, serviceKey);
  const role = await resolveServerRole(admin, authRes.data.user);
  const appUserRes = await admin.from("app_users").select("linked_player_id").eq("id", authRes.data.user.id).maybeSingle();
  if (appUserRes.error) throw new Error(appUserRes.error.message);
  return {
    admin,
    user: authRes.data.user,
    isManager: canManageLeagueRole(role),
    linkedPlayerId: (appUserRes.data?.linked_player_id as string | null) ?? null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { admin, user, isManager, linkedPlayerId } = await contextFor(req);
    const [seasonsRes, teamsRes, membershipsRes] = await Promise.all([
      admin.from("league_seasons").select("id,name,is_active,is_published,created_at").eq("is_active", true).order("created_at", { ascending: false }),
      admin.from("league_teams").select("id,season_id,location_id,name,is_active").eq("is_active", true),
      linkedPlayerId
        ? admin.from("league_team_members").select("season_id,team_id,player_id,is_captain,is_vice_captain").eq("player_id", linkedPlayerId)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const firstError = seasonsRes.error?.message || teamsRes.error?.message || membershipsRes.error?.message;
    if (firstError) throw new Error(firstError);
    const seasons = seasonsRes.data ?? [];
    const activeSeasonIds = new Set(seasons.map((season) => season.id));
    const captainTeamIds = new Set(
      (membershipsRes.data ?? [])
        .filter((membership) => membership.is_captain || membership.is_vice_captain)
        .map((membership) => membership.team_id)
    );
    const teams = (teamsRes.data ?? []).filter((team) =>
      activeSeasonIds.has(team.season_id) && (isManager || captainTeamIds.has(team.id))
    );
    const teamIds = teams.map((team) => team.id);
    let requests: Array<Record<string, unknown>> = [];
    if (isManager || teamIds.length > 0) {
      let query = admin
        .from("league_player_addition_requests")
        .select("id,season_id,team_id,requester_user_id,requested_full_name,status,resolved_player_id,reviewed_at,review_notes,created_at,updated_at")
        .order("created_at", { ascending: false });
      if (!isManager) query = query.in("team_id", teamIds);
      const requestRes = await query;
      if (requestRes.error) throw new Error(requestRes.error.message);
      requests = requestRes.data ?? [];
    }

    const relevantLocationIds = Array.from(new Set(teams.map((team) => team.location_id).filter(Boolean))) as string[];
    const candidatesRes = isManager && relevantLocationIds.length > 0
      ? await admin.from("players").select("id,full_name,display_name,location_id,is_archived").in("location_id", relevantLocationIds).eq("is_archived", false).order("full_name")
      : { data: [], error: null };
    if (candidatesRes.error) throw new Error(candidatesRes.error.message);

    return NextResponse.json({
      isManager,
      linkedPlayerId,
      seasons: seasons.map((season) => ({ ...season, registrationDeadline: registrationDeadline(season.name) })),
      teams,
      requests,
      candidates: candidatesRes.data ?? [],
      requesterUserId: user.id,
    }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Player additions could not be loaded.";
    return NextResponse.json({ error: friendlyError(message) }, { status: message === "UNAUTHORIZED" ? 401 : 400, headers: noStore });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { admin, user, linkedPlayerId } = await contextFor(req);
    if (!linkedPlayerId) return NextResponse.json({ error: "Your account must be linked to a player profile before requesting a player addition." }, { status: 403, headers: noStore });
    const body = await req.json().catch(() => ({}));
    const teamId = String(body?.teamId ?? "").trim();
    const fullName = String(body?.fullName ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
    if (!teamId || fullName.split(" ").filter(Boolean).length < 2) {
      return NextResponse.json({ error: "Select your team and enter the player's full first and second name." }, { status: 400, headers: noStore });
    }
    const [teamRes, captainRes] = await Promise.all([
      admin.from("league_teams").select("id,season_id,location_id,name,is_active").eq("id", teamId).maybeSingle(),
      admin.from("league_team_members").select("id").eq("team_id", teamId).eq("player_id", linkedPlayerId).or("is_captain.eq.true,is_vice_captain.eq.true").maybeSingle(),
    ]);
    if (teamRes.error || captainRes.error) throw new Error(teamRes.error?.message || captainRes.error?.message || "Request validation failed.");
    if (!teamRes.data || !teamRes.data.is_active || !captainRes.data) {
      return NextResponse.json({ error: "Only the captain or vice-captain can request a player for this team." }, { status: 403, headers: noStore });
    }
    const seasonRes = await admin.from("league_seasons").select("id,name,is_active").eq("id", teamRes.data.season_id).maybeSingle();
    if (seasonRes.error || !seasonRes.data) throw new Error(seasonRes.error?.message ?? "League season not found.");
    const deadline = registrationDeadline(seasonRes.data.name);
    if (!seasonRes.data.is_active || Date.now() > Date.parse(deadline)) {
      return NextResponse.json({ error: "Captain player additions closed at the end of 31 December for this season." }, { status: 409, headers: noStore });
    }
    const existingRequest = await admin
      .from("league_player_addition_requests")
      .select("id")
      .eq("team_id", teamId)
      .eq("status", "pending")
      .ilike("requested_full_name", fullName)
      .maybeSingle();
    if (existingRequest.error) throw new Error(existingRequest.error.message);
    if (existingRequest.data) return NextResponse.json({ error: `${fullName} is already awaiting review for ${teamRes.data.name}.` }, { status: 409, headers: noStore });
    const insertRes = await admin.from("league_player_addition_requests").insert({
      season_id: teamRes.data.season_id,
      team_id: teamId,
      requester_user_id: user.id,
      requested_full_name: fullName,
      status: "pending",
    }).select("id").single();
    if (insertRes.error) throw new Error(insertRes.error.message);
    await sendPushToLeagueManagers(admin, {
      title: "Player addition awaiting review",
      body: `${teamRes.data.name} has requested ${fullName} for its league roster.`,
      url: `/player-additions?requestId=${encodeURIComponent(insertRes.data.id)}`,
      tag: `player-addition-${insertRes.data.id}`,
    });
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Player addition could not be submitted.";
    return NextResponse.json({ error: friendlyError(message) }, { status: message === "UNAUTHORIZED" ? 401 : 400, headers: noStore });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { admin, user, isManager } = await contextFor(req);
    if (!isManager) return NextResponse.json({ error: "League officer access is required." }, { status: 403, headers: noStore });
    const body = await req.json().catch(() => ({}));
    const requestId = String(body?.requestId ?? "").trim();
    const action = String(body?.action ?? "").trim();
    const selectedPlayerId = String(body?.playerId ?? "").trim() || null;
    const reviewNotes = String(body?.reviewNotes ?? "").trim().slice(0, 500) || null;
    if (!requestId || !["approve", "reject"].includes(action)) return NextResponse.json({ error: "Choose a valid request and review action." }, { status: 400, headers: noStore });
    const requestRes = await admin
      .from("league_player_addition_requests")
      .select("id,season_id,team_id,requested_full_name,status")
      .eq("id", requestId)
      .maybeSingle();
    if (requestRes.error) throw new Error(requestRes.error.message);
    if (!requestRes.data || requestRes.data.status !== "pending") return NextResponse.json({ error: "This request is no longer awaiting review." }, { status: 409, headers: noStore });
    const requestRow = requestRes.data;
    if (action === "reject") {
      const rejectRes = await admin.from("league_player_addition_requests").update({ status: "rejected", reviewed_by_user_id: user.id, reviewed_at: new Date().toISOString(), review_notes: reviewNotes, updated_at: new Date().toISOString() }).eq("id", requestId).eq("status", "pending");
      if (rejectRes.error) throw new Error(rejectRes.error.message);
      return NextResponse.json({ ok: true }, { headers: noStore });
    }

    const teamRes = await admin.from("league_teams").select("id,season_id,location_id,name").eq("id", requestRow.team_id).maybeSingle();
    if (teamRes.error || !teamRes.data) throw new Error(teamRes.error?.message ?? "Team not found.");
    let playerId = selectedPlayerId;
    if (playerId) {
      const playerRes = await admin.from("players").select("id,is_archived").eq("id", playerId).maybeSingle();
      if (playerRes.error || !playerRes.data || playerRes.data.is_archived) throw new Error(playerRes.error?.message ?? "Selected player profile is not available.");
    } else {
      const clubPlayersRes = teamRes.data.location_id
        ? await admin.from("players").select("id,full_name,display_name").eq("location_id", teamRes.data.location_id).eq("is_archived", false)
        : { data: [], error: null };
      if (clubPlayersRes.error) throw new Error(clubPlayersRes.error.message);
      const exact = (clubPlayersRes.data ?? []).filter((player) =>
        [player.full_name, player.display_name].some((name) => normalizePlayerName(name ?? "") === normalizePlayerName(requestRow.requested_full_name))
      );
      if (exact.length > 1) return NextResponse.json({ error: "More than one matching profile exists. Select the correct existing player before approving." }, { status: 409, headers: noStore });
      playerId = exact[0]?.id ?? null;
      if (!playerId) {
        const words = requestRow.requested_full_name.split(" ").filter(Boolean);
        const createRes = await admin.from("players").insert({
          display_name: requestRow.requested_full_name,
          first_name: words[0],
          full_name: requestRow.requested_full_name,
          nickname: null,
          is_archived: false,
          location_id: teamRes.data.location_id,
        }).select("id").single();
        if (createRes.error) throw new Error(createRes.error.message);
        playerId = createRes.data.id;
      }
    }
    const conflictRes = await admin.from("league_team_members").select("id,team_id").eq("season_id", requestRow.season_id).eq("player_id", playerId);
    if (conflictRes.error) throw new Error(conflictRes.error.message);
    const otherTeam = (conflictRes.data ?? []).find((membership) => membership.team_id !== requestRow.team_id);
    if (otherTeam) return NextResponse.json({ error: "That player is already registered to another team in this league season." }, { status: 409, headers: noStore });
    if ((conflictRes.data ?? []).length === 0) {
      const memberRes = await admin.from("league_team_members").insert({ season_id: requestRow.season_id, team_id: requestRow.team_id, player_id: playerId, is_captain: false, is_vice_captain: false });
      if (memberRes.error) throw new Error(memberRes.error.message);
    }
    if (teamRes.data.location_id) {
      const templateRes = await admin.from("league_registered_teams").select("id").eq("location_id", teamRes.data.location_id).ilike("name", teamRes.data.name).maybeSingle();
      if (!templateRes.error && templateRes.data) {
        const existingTemplateMember = await admin.from("league_registered_team_members").select("id").eq("team_id", templateRes.data.id).eq("player_id", playerId).maybeSingle();
        if (!existingTemplateMember.error && !existingTemplateMember.data) await admin.from("league_registered_team_members").insert({ team_id: templateRes.data.id, player_id: playerId, is_captain: false, is_vice_captain: false });
      }
    }
    const approveRes = await admin.from("league_player_addition_requests").update({ status: "approved", resolved_player_id: playerId, reviewed_by_user_id: user.id, reviewed_at: new Date().toISOString(), review_notes: reviewNotes, updated_at: new Date().toISOString() }).eq("id", requestId).eq("status", "pending");
    if (approveRes.error) throw new Error(approveRes.error.message);
    return NextResponse.json({ ok: true, playerId }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Player addition could not be reviewed.";
    return NextResponse.json({ error: friendlyError(message) }, { status: message === "UNAUTHORIZED" ? 401 : 400, headers: noStore });
  }
}
