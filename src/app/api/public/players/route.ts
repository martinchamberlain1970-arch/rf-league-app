import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type PlayerRow = {
  id: string;
  full_name: string | null;
  display_name: string;
  claimed_by?: string | null;
  location_id?: string | null;
  is_archived?: boolean | null;
};

type TeamRow = { id: string; name: string; location_id: string | null };
type TeamIdRow = { id: string };
type TeamMemberRow = { player_id: string };

export async function GET(req: NextRequest) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server configuration missing." }, { status: 500 });
  }

  const locationId = req.nextUrl.searchParams.get("locationId")?.trim() ?? "";
  const teamId = req.nextUrl.searchParams.get("teamId")?.trim() ?? "";

  if (!locationId) {
    return NextResponse.json({ players: [] });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const directPlayersPromise = adminClient
    .from("players")
    .select("id,full_name,display_name,claimed_by,location_id,is_archived")
    .eq("location_id", locationId)
    .eq("is_archived", false)
    .order("full_name", { ascending: true });

  const registeredTeamsPromise = adminClient
    .from("league_registered_teams")
    .select("id")
    .eq("location_id", locationId);

  const liveTeamsPromise = adminClient
    .from("league_teams")
    .select("id")
    .eq("location_id", locationId);

  const selectedTeamPromise = teamId
    ? adminClient
        .from("league_registered_teams")
        .select("id,name,location_id")
        .eq("id", teamId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [directPlayersRes, registeredTeamsRes, liveTeamsRes, selectedTeamRes] = await Promise.all([
    directPlayersPromise,
    registeredTeamsPromise,
    liveTeamsPromise,
    selectedTeamPromise,
  ]);

  if (directPlayersRes.error) {
    return NextResponse.json({ error: directPlayersRes.error.message }, { status: 500 });
  }

  const combinedById = new Map<string, PlayerRow>();
  ((directPlayersRes.data ?? []) as PlayerRow[]).forEach((player) => {
    combinedById.set(player.id, player);
  });

  const registeredTeamIds = !registeredTeamsRes.error
    ? ((registeredTeamsRes.data ?? []) as TeamIdRow[]).map((row) => row.id).filter(Boolean)
    : [];
  const liveTeamIds = !liveTeamsRes.error
    ? ((liveTeamsRes.data ?? []) as TeamIdRow[]).map((row) => row.id).filter(Boolean)
    : [];

  const rosterPlayerIds = new Set<string>();

  if (registeredTeamIds.length > 0 || liveTeamIds.length > 0) {
    const [registeredMembersRes, liveMembersRes] = await Promise.all([
      registeredTeamIds.length > 0
        ? adminClient.from("league_registered_team_members").select("player_id").in("team_id", registeredTeamIds)
        : Promise.resolve({ data: [], error: null }),
      liveTeamIds.length > 0
        ? adminClient.from("league_team_members").select("player_id").in("team_id", liveTeamIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (!registeredMembersRes.error) {
      ((registeredMembersRes.data ?? []) as TeamMemberRow[])
        .map((row) => row.player_id)
        .filter(Boolean)
        .forEach((playerId) => rosterPlayerIds.add(playerId));
    }

    if (!liveMembersRes.error) {
      ((liveMembersRes.data ?? []) as TeamMemberRow[])
        .map((row) => row.player_id)
        .filter(Boolean)
        .forEach((playerId) => rosterPlayerIds.add(playerId));
    }
  }

  const missingRosterPlayerIds = Array.from(rosterPlayerIds).filter((playerId) => !combinedById.has(playerId));
  if (missingRosterPlayerIds.length > 0) {
    const rosterPlayersRes = await adminClient
      .from("players")
      .select("id,full_name,display_name,claimed_by,location_id,is_archived")
      .in("id", missingRosterPlayerIds)
      .eq("is_archived", false)
      .order("full_name", { ascending: true });

    if (!rosterPlayersRes.error) {
      ((rosterPlayersRes.data ?? []) as PlayerRow[]).forEach((player) => {
        combinedById.set(player.id, player);
      });
    }
  }

  let filteredIds: Set<string> | null = null;
  const selectedTeam = selectedTeamRes.data as TeamRow | null;

  if (teamId && selectedTeam) {
    const [registeredMembersRes, liveTeamsByNameRes] = await Promise.all([
      adminClient.from("league_registered_team_members").select("player_id").eq("team_id", teamId),
      adminClient
        .from("league_teams")
        .select("id")
        .eq("name", selectedTeam.name)
        .eq("location_id", selectedTeam.location_id),
    ]);

    filteredIds = new Set<string>();

    if (!registeredMembersRes.error) {
      ((registeredMembersRes.data ?? []) as TeamMemberRow[])
        .map((row) => row.player_id)
        .filter(Boolean)
        .forEach((playerId) => filteredIds?.add(playerId));
    }

    const matchingLiveTeamIds = !liveTeamsByNameRes.error
      ? ((liveTeamsByNameRes.data ?? []) as TeamIdRow[]).map((row) => row.id).filter(Boolean)
      : [];

    if (matchingLiveTeamIds.length > 0) {
      const liveMembersRes = await adminClient
        .from("league_team_members")
        .select("player_id")
        .in("team_id", matchingLiveTeamIds);

      if (!liveMembersRes.error) {
        ((liveMembersRes.data ?? []) as TeamMemberRow[])
          .map((row) => row.player_id)
          .filter(Boolean)
          .forEach((playerId) => filteredIds?.add(playerId));
      }
    }
  }

  const players = Array.from(combinedById.values())
    .filter((player) => !player.claimed_by)
    .filter((player) => (filteredIds ? filteredIds.has(player.id) : true))
    .sort((a, b) => {
      const aName = a.full_name?.trim() || a.display_name;
      const bName = b.full_name?.trim() || b.display_name;
      return aName.localeCompare(bName);
    });

  return NextResponse.json({ players });
}
