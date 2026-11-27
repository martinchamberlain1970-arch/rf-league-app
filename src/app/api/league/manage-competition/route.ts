import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { competitionEntriesOpen } from "@/lib/fixed-competition-handicaps";
import { entryRoster, isLeagueCup, knockoutBestOf, knockoutMatchFields, knockoutOpeningRound, knockoutSize } from "@/lib/knockout-draw";
import { ageFromDob, competitionAgeRule, entrantsRequired, meetsCompetitionAgeRule } from "@/lib/public-competition-entry";
import { requireLeagueManager } from "@/lib/server-role";

const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return error("Sign in as a league officer.", 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return error("Competition management is unavailable.", 503);
  const { data: { user }, error: authError } = await createClient(url, anon).auth.getUser(token);
  if (authError || !user) return error("Sign in as a league officer.", 401);
  const client = createClient(url, service);
  try {
    await requireLeagueManager(client, user);
  } catch {
    return error("League officer access is required.", 403);
  }

  const body = await request.json().catch(() => null);
  const competitionId = body?.competitionId;
  if (typeof competitionId !== "string" || !uuid.test(competitionId)) return error("Select a competition.");
  const competition = await client.from("competitions")
    .select("id,name,competition_format,match_mode,is_archived,is_completed,signup_open,signup_deadline,best_of,knockout_round_best_of,app_assign_opening_break")
    .eq("id", competitionId).maybeSingle();
  if (competition.error) return error("Competition settings could not be loaded.", 500);
  const cup = competition.data;
  if (!cup || cup.is_archived || cup.is_completed) return error("This competition is unavailable.", 404);
  const required = entrantsRequired(cup);

  if (body.action === "add_entry") {
    const ids: unknown = body.playerIds;
    if (!Array.isArray(ids) || ids.length !== required || ids.some((id) => typeof id !== "string" || !uuid.test(id)) || new Set(ids).size !== ids.length) {
      return error(`Select ${required === 1 ? "one player" : `${required} different players`}.`);
    }
    const { minimum, maximum } = competitionAgeRule(cup.name);
    const restricted = minimum !== null || maximum !== null;
    const people = await client.from("players").select("id,display_name,full_name,date_of_birth").in("id", ids).eq("is_archived", false);
    if (people.error) return error("Player records could not be checked.", 500);
    if (people.data.length !== ids.length) return error("Choose active player records.");
    const byId = new Map(people.data.map((person) => [person.id, person]));
    const lead = byId.get(ids[0])!;
    const enteredDob = typeof body.dateOfBirth === "string" ? body.dateOfBirth.trim() : "";
    const dateOfBirth = restricted ? lead.date_of_birth || enteredDob : null;
    if (restricted) {
      const age = ageFromDob(dateOfBirth ?? "");
      if (age === null) return error("Enter a valid date of birth for this player.");
      if (!meetsCompetitionAgeRule(age, { minimum, maximum })) return error("This player does not meet the age requirement.");
    }

    if (required > 1 && isLeagueCup(cup.name)) {
      const seasons = await client.from("league_seasons").select("id").eq("is_active", true).eq("is_published", true);
      if (seasons.error) return error("The players’ club registrations could not be checked.", 500);
      const seasonIds = seasons.data.map((season) => season.id);
      const roster = seasonIds.length
        ? await client.from("league_team_members").select("player_id,team_id").in("player_id", ids).in("season_id", seasonIds)
        : { data: [], error: null };
      if (roster.error) return error("The players’ club registrations could not be checked.", 500);
      const teamIds = [...new Set(roster.data.map((member) => member.team_id))];
      const teams = teamIds.length
        ? await client.from("league_teams").select("id,location_id").in("id", teamIds).eq("is_active", true)
        : { data: [], error: null };
      if (teams.error) return error("The players’ club registrations could not be checked.", 500);
      const clubs = new Map(teams.data.map((team) => [team.id, team.location_id ?? team.id]));
      const clubIds = (playerId: string) => roster.data.flatMap((member) => {
        const club = clubs.get(member.team_id);
        return member.player_id === playerId && club ? [club] : [];
      });
      if (!clubIds(lead.id).some((club) => ids.every((id) => clubIds(id).includes(club)))) {
        return error("Choose players registered at the same club.");
      }
    }

    const { error: saved } = await client.rpc("add_officer_competition_entry", {
      p_competition_id: cup.id,
      p_actor_id: user.id,
      p_player_ids: ids,
      p_dob: dateOfBirth,
      p_note: { source: "offline_superuser_entry", teamMemberIds: ids.slice(1), teamMemberNames: ids.slice(1).map((id) => {
        const person = byId.get(id)!;
        return person.full_name?.trim() || person.display_name;
      }) },
    });
    if (saved) return error(saved.code === "PGRST202" ? "Saving requires the competition management database update." : saved.message, 409);
    return NextResponse.json({ ok: true });
  }

  if (body.action !== "publish_draw") return error("Choose a competition action.");
  if (cup.competition_format !== "knockout") return error("Choose a knockout competition.");
  if (cup.signup_open && competitionEntriesOpen(cup.signup_deadline)) return error("Close entries before publishing the draw.", 409);
  const order: unknown = body.entryIds;
  if (!Array.isArray(order) || order.some((id) => typeof id !== "string" || !uuid.test(id)) || new Set(order).size !== order.length) {
    return error("Create a fresh draw preview.");
  }
  if (order.length < (isLeagueCup(cup.name) ? 4 : 2)) return error("There are too few entries for this knockout draw.");
  const entries = await client.from("competition_entries").select("id,player_id,note,status").eq("competition_id", cup.id).in("status", ["approved", "pending"]);
  if (entries.error) return error("The approved entries could not be checked.", 500);
  if (entries.data.some((entry) => entry.status === "pending")) return error("Review the pending entries before publishing.", 409);
  const byId = new Map(entries.data.map((entry) => [entry.id, entry]));
  if (order.length !== byId.size || order.some((id) => !byId.has(id))) return error("Entries have changed. Create a fresh preview.", 409);
  const rosters = order.map((id) => entryRoster(byId.get(id)!));
  if (rosters.some((roster) => roster.length !== required || roster.some((id) => !uuid.test(id))) ||
    new Set(rosters.flat()).size !== rosters.flat().length) {
    return error("Resolve incomplete or duplicate player records before publishing.");
  }
  const { rounds } = knockoutSize(order.length);
  const bestOf = knockoutBestOf(cup.knockout_round_best_of, cup.best_of, 1, rounds);
  const ties = knockoutOpeningRound(rosters).map(({ home, away }, index) => {
    const players = [...home, ...(away ?? [])];
    return {
      ...knockoutMatchFields(home, away ?? [], required > 1),
      match_no: index + 1,
      best_of: bestOf,
      status: away ? "pending" : "bye",
      winner_player_id: away ? null : home[0],
      opening_break_player_id: away && cup.app_assign_opening_break ? players[Math.floor(Math.random() * players.length)] : null,
    };
  });
  const { error: published } = await client.rpc("publish_competition_opening_draw", {
    p_competition_id: cup.id, p_entry_ids: order, p_matches: ties,
  });
  if (published) return error(published.code === "PGRST202" ? "Publishing requires the competition management database update." : published.message, 409);
  return NextResponse.json({ ok: true });
}
