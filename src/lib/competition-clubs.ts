import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllSupabasePages } from "@/lib/supabase-pagination";

type Membership = { player_id: string; team_id: string };
export type CompetitionClub = { id: string; locationId: string | null; teamName: string };
export type CompetitionClubs = ReadonlyMap<string, CompetitionClub[]>;

export async function loadCompetitionClubs(client: SupabaseClient, playerIds?: string[]) {
  const { data: seasons, error: seasonError } = await client.from("league_seasons")
    .select("id").eq("is_active", true).eq("is_published", true);
  if (seasonError) throw seasonError;
  const byPlayer = new Map<string, CompetitionClub[]>();
  if (!seasons.length) return byPlayer;

  const seasonIds = seasons.map(({ id }) => id);
  const [teams, memberships] = await Promise.all([
    client.from("league_teams").select("id,name,location_id").in("season_id", seasonIds).eq("is_active", true),
    fetchAllSupabasePages<Membership>((from, to) => {
      const query = client.from("league_team_members").select("player_id,team_id").in("season_id", seasonIds);
      return (playerIds ? query.in("player_id", playerIds) : query).order("id").range(from, to);
    }),
  ]);
  if (teams.error || memberships.error) throw teams.error ?? memberships.error;
  const clubs = new Map(teams.data!.map((team) => [team.id, {
    id: team.location_id ?? team.id,
    locationId: team.location_id,
    teamName: team.name,
  }]));
  for (const member of memberships.data ?? []) {
    const club = clubs.get(member.team_id);
    if (!club) continue;
    const registered = byPlayer.get(member.player_id) ?? [];
    if (!registered.some(({ id }) => id === club.id)) {
      byPlayer.set(member.player_id, [...registered, club]);
    }
  }
  return byPlayer;
}

export function playersShareCompetitionClub(clubs: CompetitionClubs, playerIds: readonly string[]) {
  const [first, ...others] = playerIds;
  return Boolean(clubs.get(first)?.some(({ id }) =>
    others.every((playerId) => clubs.get(playerId)?.some((club) => club.id === id))
  ));
}
