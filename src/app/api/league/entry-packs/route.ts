import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { requireLeagueManager } from "@/lib/server-role";
import { logServerAudit } from "@/lib/server-audit";
import { normalizeEntryPackPayload, validateEntryPackPayload, type LeagueEntryPackPlayer } from "@/lib/league-entry-pack";
import { normalizePlayerName, playerNameMatchKind } from "@/lib/player-name-match";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function authorize(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) throw new Error("SERVER_NOT_CONFIGURED");
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("UNAUTHORIZED");
  const authClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const authRes = await authClient.auth.getUser(token);
  if (authRes.error || !authRes.data.user) throw new Error("UNAUTHORIZED");
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  await requireLeagueManager(adminClient, authRes.data.user);
  return { adminClient, officerClient: authClient, user: authRes.data.user };
}

function responseForError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  if (message === "SERVER_NOT_CONFIGURED") return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (message === "FORBIDDEN_LEAGUE_MANAGER") return NextResponse.json({ error: "League Secretary, Chairman or Treasurer access is required." }, { status: 403 });
  return NextResponse.json({ error: message }, { status: 400 });
}

async function assertEntryPacksOpen(adminClient: SupabaseClient, seasonId: string) {
  const [seasonRes, startedFixturesRes] = await Promise.all([
    adminClient.from("league_seasons").select("id,is_active").eq("id", seasonId).maybeSingle(),
    adminClient
      .from("league_fixtures")
      .select("id")
      .eq("season_id", seasonId)
      .in("status", ["in_progress", "complete"])
      .limit(1),
  ]);
  if (seasonRes.error || startedFixturesRes.error) throw new Error(seasonRes.error?.message ?? startedFixturesRes.error?.message ?? "Failed to check league status.");
  if (!seasonRes.data) throw new Error("League season not found.");
  if (seasonRes.data.is_active === false || (startedFixturesRes.data?.length ?? 0) > 0) {
    throw new Error("Team entry packs are only available for open leagues that have not started.");
  }
}

export async function GET(req: NextRequest) {
  try {
    const { adminClient } = await authorize(req);
    const [packsRes, seasonsRes, teamsRes, locationsRes, startedFixturesRes, playersRes] = await Promise.all([
      adminClient
        .from("league_entry_packs")
        .select("id,public_token,season_id,team_id,status,common_draft_token,contact_name,contact_email,contact_phone,players,competition_notes,general_notes,submitted_at,reviewed_at,review_notes,created_at,updated_at")
        .order("updated_at", { ascending: false }),
      adminClient.from("league_seasons").select("id,name,is_published,is_active,created_at").eq("is_active", true).order("created_at", { ascending: false }),
      adminClient.from("league_teams").select("id,season_id,location_id,name,is_active").order("name"),
      adminClient.from("locations").select("id,name").order("name"),
      adminClient.from("league_fixtures").select("season_id").in("status", ["in_progress", "complete"]),
      adminClient.from("players").select("id,full_name,display_name,location_id,is_archived"),
    ]);
    const firstError = packsRes.error?.message || seasonsRes.error?.message || teamsRes.error?.message || locationsRes.error?.message || startedFixturesRes.error?.message || playersRes.error?.message;
    if (firstError) throw new Error(firstError);
    const startedSeasonIds = new Set((startedFixturesRes.data ?? []).map((fixture) => fixture.season_id));
    const openSeasons = (seasonsRes.data ?? []).filter((season) => !startedSeasonIds.has(season.id));
    const openSeasonIds = new Set(openSeasons.map((season) => season.id));
    const locationNameById = new Map((locationsRes.data ?? []).map((location) => [location.id, location.name]));
    const existingPlayers = (playersRes.data ?? []).map((player) => ({
      id: player.id,
      name: player.full_name?.trim() || player.display_name,
      locationName: player.location_id ? locationNameById.get(player.location_id) ?? "Unknown club" : "No club",
      isArchived: Boolean(player.is_archived),
    }));
    const packs = (packsRes.data ?? []).filter((pack) => openSeasonIds.has(pack.season_id)).map((pack) => ({
      ...pack,
      player_matches: pack.status === "submitted" && Array.isArray(pack.players)
        ? normalizeEntryPackPayload({ players: pack.players }).players.map((player) => ({
            rowId: player.rowId,
            matches: existingPlayers
              .map((candidate) => ({ ...candidate, kind: playerNameMatchKind(player.fullName, candidate.name) }))
              .filter((candidate) => candidate.kind !== null)
              .sort((left, right) => (left.kind === "exact" ? -1 : 1) - (right.kind === "exact" ? -1 : 1))
              .slice(0, 5),
          })).filter((entry) => entry.matches.length > 0)
        : [],
    }));
    return NextResponse.json({
      packs,
      seasons: openSeasons,
      teams: (teamsRes.data ?? []).filter((team) => openSeasonIds.has(team.season_id)),
      locations: locationsRes.data ?? [],
    });
  } catch (error) {
    return responseForError(error);
  }
}

async function createOrReturnPack(adminClient: SupabaseClient, user: User, seasonId: string, teamId: string) {
  await assertEntryPacksOpen(adminClient, seasonId);
  const teamRes = await adminClient.from("league_teams").select("id,season_id").eq("id", teamId).maybeSingle();
  if (teamRes.error) throw new Error(teamRes.error.message);
  if (!teamRes.data || teamRes.data.season_id !== seasonId) throw new Error("Select a team belonging to the chosen season.");
  const existingRes = await adminClient
    .from("league_entry_packs")
    .select("id,public_token,status")
    .eq("season_id", seasonId)
    .eq("team_id", teamId)
    .maybeSingle();
  if (existingRes.error) throw new Error(existingRes.error.message);
  if (existingRes.data) return existingRes.data;
  const membersRes = await adminClient
    .from("league_team_members")
    .select("player_id,is_captain,is_vice_captain")
    .eq("season_id", seasonId)
    .eq("team_id", teamId);
  if (membersRes.error) throw new Error(membersRes.error.message);
  const memberRows = membersRes.data ?? [];
  const playerIds = memberRows.map((member) => member.player_id).filter(Boolean);
  let seededPlayers: LeagueEntryPackPlayer[] = [];
  if (playerIds.length > 0) {
    const playersRes = await adminClient.from("players").select("id,full_name,display_name").in("id", playerIds);
    if (playersRes.error) throw new Error(playersRes.error.message);
    const playerById = new Map((playersRes.data ?? []).map((player) => [player.id, player]));
    seededPlayers = memberRows.flatMap((member) => {
      const player = playerById.get(member.player_id);
      if (!player) return [];
      return [{
        rowId: `player-${player.id}`,
        fullName: player.full_name?.trim() || player.display_name,
        phoneNumber: "",
        email: "",
        isCaptain: Boolean(member.is_captain),
        isViceCaptain: Boolean(member.is_vice_captain),
        competitionIds: [],
      }];
    });
  }
  const createRes = await adminClient
    .from("league_entry_packs")
    .insert({
      season_id: seasonId,
      team_id: teamId,
      created_by_user_id: user.id,
      players: seededPlayers,
    })
    .select("id,public_token,status")
    .single();
  if (createRes.error) throw new Error(createRes.error.message);
  return createRes.data;
}

async function approveAndImport(adminClient: SupabaseClient, user: User, packId: string, reviewNotes: string) {
  const packRes = await adminClient
    .from("league_entry_packs")
    .select("id,season_id,team_id,status,players")
    .eq("id", packId)
    .maybeSingle();
  if (packRes.error) throw new Error(packRes.error.message);
  if (!packRes.data) throw new Error("Entry pack not found.");
  if (packRes.data.status !== "submitted") throw new Error("Only submitted entry packs can be approved.");
  await assertEntryPacksOpen(adminClient, packRes.data.season_id);

  const payload = normalizeEntryPackPayload({
    contactName: "Reviewed pack",
    contactEmail: "",
    contactPhone: "",
    players: packRes.data.players,
    competitionNotes: "",
    phoneSharingConfirmed: false,
    accuracyConfirmed: true,
  });
  const validationError = validateEntryPackPayload(payload, true);
  if (validationError) throw new Error(validationError);

  const teamRes = await adminClient.from("league_teams").select("id,name,season_id,location_id").eq("id", packRes.data.team_id).maybeSingle();
  if (teamRes.error) throw new Error(teamRes.error.message);
  if (!teamRes.data) throw new Error("The linked league team no longer exists.");

  const allPlayersRes = await adminClient.from("players").select("id,full_name,display_name,location_id,is_archived");
  if (allPlayersRes.error) throw new Error(allPlayersRes.error.message);
  const allPlayers = (allPlayersRes.data ?? []) as Array<{ id: string; full_name: string | null; display_name: string; location_id: string | null; is_archived?: boolean | null }>;
  const usedDisplayNames = new Set(allPlayers.map((player) => player.display_name.trim().toLowerCase()));
  const resolved = new Map<string, string>();

  for (const player of payload.players) {
    const key = normalizePlayerName(player.fullName);
    const exact = allPlayers.filter((candidate) => normalizePlayerName(candidate.full_name?.trim() || candidate.display_name) === key);
    if (exact.length > 1) throw new Error(`More than one historic profile matches ${player.fullName}. Resolve the duplicate before approving this pack.`);
    if (exact.length === 1) {
      const updateRes = await adminClient
        .from("players")
        .update({
          location_id: teamRes.data.location_id,
          is_archived: false,
          age_band: "18_plus",
          guardian_name: null,
        })
        .eq("id", exact[0].id);
      if (updateRes.error) throw new Error(updateRes.error.message);
      resolved.set(player.rowId, exact[0].id);
      continue;
    }

    const firstName = player.fullName.split(/\s+/)[0];
    let displayName = firstName;
    if (usedDisplayNames.has(displayName.toLowerCase())) displayName = player.fullName;
    let suffix = 2;
    while (usedDisplayNames.has(displayName.toLowerCase())) {
      displayName = `${player.fullName} ${suffix}`;
      suffix += 1;
    }
    usedDisplayNames.add(displayName.toLowerCase());
    const insertRes = await adminClient
      .from("players")
      .insert({
        full_name: player.fullName,
        display_name: displayName,
        location_id: teamRes.data.location_id,
        is_archived: false,
        age_band: "18_plus",
        guardian_name: null,
      })
      .select("id")
      .single();
    if (insertRes.error) throw new Error(insertRes.error.message);
    resolved.set(player.rowId, insertRes.data.id);
  }

  const rosterPlayerIds = Array.from(new Set(resolved.values()));
  const currentTeamMembersRes = await adminClient
    .from("league_team_members")
    .select("id,player_id")
    .eq("season_id", packRes.data.season_id)
    .eq("team_id", packRes.data.team_id);
  if (currentTeamMembersRes.error) throw new Error(currentTeamMembersRes.error.message);
  const submittedPlayerIds = new Set(rosterPlayerIds);
  const staleMembershipIds = (currentTeamMembersRes.data ?? [])
    .filter((member) => !submittedPlayerIds.has(member.player_id))
    .map((member) => member.id);
  if (staleMembershipIds.length > 0) {
    const staleDeleteRes = await adminClient.from("league_team_members").delete().in("id", staleMembershipIds);
    if (staleDeleteRes.error) throw new Error(staleDeleteRes.error.message);
  }

  let movedMembershipCount = 0;
  for (const playerId of rosterPlayerIds) {
    const otherMembershipsRes = await adminClient
      .from("league_team_members")
      .select("id")
      .eq("season_id", packRes.data.season_id)
      .eq("player_id", playerId)
      .neq("team_id", packRes.data.team_id);
    if (otherMembershipsRes.error) throw new Error(otherMembershipsRes.error.message);
    const otherMembershipIds = (otherMembershipsRes.data ?? []).map((member) => member.id);
    if (otherMembershipIds.length > 0) {
      const moveDeleteRes = await adminClient.from("league_team_members").delete().in("id", otherMembershipIds);
      if (moveDeleteRes.error) throw new Error(moveDeleteRes.error.message);
      movedMembershipCount += otherMembershipIds.length;
    }
  }

  const clearRolesRes = await adminClient
    .from("league_team_members")
    .update({ is_captain: false, is_vice_captain: false })
    .eq("season_id", packRes.data.season_id)
    .eq("team_id", packRes.data.team_id);
  if (clearRolesRes.error) throw new Error(clearRolesRes.error.message);

  for (const player of payload.players) {
    const playerId = resolved.get(player.rowId)!;
    const memberRes = await adminClient
      .from("league_team_members")
      .select("id")
      .eq("season_id", packRes.data.season_id)
      .eq("team_id", packRes.data.team_id)
      .eq("player_id", playerId)
      .maybeSingle();
    if (memberRes.error) throw new Error(memberRes.error.message);
    const memberWrite = memberRes.data?.id
      ? await adminClient.from("league_team_members").update({ is_captain: player.isCaptain, is_vice_captain: player.isViceCaptain }).eq("id", memberRes.data.id)
      : await adminClient.from("league_team_members").insert({
          season_id: packRes.data.season_id,
          team_id: packRes.data.team_id,
          player_id: playerId,
          is_captain: player.isCaptain,
          is_vice_captain: player.isViceCaptain,
        });
    if (memberWrite.error) throw new Error(memberWrite.error.message);
  }

  const now = new Date().toISOString();
  const approvalRes = await adminClient
    .from("league_entry_packs")
    .update({ status: "approved", reviewed_at: now, reviewed_by_user_id: user.id, review_notes: reviewNotes || null, updated_at: now })
    .eq("id", packId)
    .eq("status", "submitted");
  if (approvalRes.error) throw new Error(approvalRes.error.message);
  await logServerAudit(adminClient, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    actorRole: "league_manager",
    action: "league_entry_pack_approved",
    entityType: "league_entry_pack",
    entityId: packId,
    summary: `${teamRes.data.name} entry pack approved and imported (${payload.players.length} players).`,
    meta: {
      season_id: packRes.data.season_id,
      team_id: packRes.data.team_id,
      player_count: payload.players.length,
      removed_memberships: staleMembershipIds.length,
      moved_memberships: movedMembershipCount,
    },
  });
  return { importedPlayers: payload.players.length, removedMemberships: staleMembershipIds.length, movedMemberships: movedMembershipCount };
}

export async function POST(req: NextRequest) {
  try {
    const { adminClient, user } = await authorize(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "create");
    if (action === "create") {
      const seasonId = String(body?.seasonId ?? "").trim();
      const teamId = String(body?.teamId ?? "").trim();
      if (!seasonId || !teamId) throw new Error("Select a season and team.");
      const pack = await createOrReturnPack(adminClient, user, seasonId, teamId);
      return NextResponse.json({ ok: true, pack });
    }

    const packId = String(body?.packId ?? "").trim();
    if (!packId) throw new Error("packId is required.");
    const packScopeRes = await adminClient.from("league_entry_packs").select("season_id").eq("id", packId).maybeSingle();
    if (packScopeRes.error) throw new Error(packScopeRes.error.message);
    if (!packScopeRes.data) throw new Error("Entry pack not found.");
    await assertEntryPacksOpen(adminClient, packScopeRes.data.season_id);
    if (action === "rotate") {
      const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const rotateRes = await adminClient.from("league_entry_packs").update({ public_token: token, common_draft_token: null, updated_at: new Date().toISOString() }).eq("id", packId).select("public_token").single();
      if (rotateRes.error) throw new Error(rotateRes.error.message);
      return NextResponse.json({ ok: true, publicToken: rotateRes.data.public_token });
    }
    if (action === "reject") {
      const reviewNotes = String(body?.reviewNotes ?? "").trim().slice(0, 2000);
      if (!reviewNotes) throw new Error("Enter a reason before returning the pack for correction.");
      const rejectRes = await adminClient
        .from("league_entry_packs")
        .update({ status: "rejected", review_notes: reviewNotes, reviewed_at: new Date().toISOString(), reviewed_by_user_id: user.id, updated_at: new Date().toISOString() })
        .eq("id", packId)
        .eq("status", "submitted");
      if (rejectRes.error) throw new Error(rejectRes.error.message);
      return NextResponse.json({ ok: true });
    }
    if (action === "approve") {
      const result = await approveAndImport(adminClient, user, packId, String(body?.reviewNotes ?? "").trim().slice(0, 2000));
      return NextResponse.json({ ok: true, ...result });
    }
    throw new Error("Unsupported action.");
  } catch (error) {
    return responseForError(error);
  }
}
