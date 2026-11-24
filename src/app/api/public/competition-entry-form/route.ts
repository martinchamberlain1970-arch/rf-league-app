import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { competitionEntriesOpen } from "@/lib/fixed-competition-handicaps";
import { ageFromDob, competitionAgeRule, meetsCompetitionAgeRule, validatePublicSelections, type PublicCompetition, type PublicCompetitionPartner, type PublicCompetitionPlayer, type PublicCompetitionSelection } from "@/lib/public-competition-entry";

export const dynamic = "force-dynamic";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

async function formData(client: SupabaseClient, teamId?: string) {
  const [seasonsRes, competitionsRes] = await Promise.all([
    client.from("league_seasons").select("id,name").eq("is_active", true).eq("is_published", true),
    client.from("competitions").select("id,name,match_mode,signup_deadline").eq("competition_format", "knockout").eq("signup_open", true).eq("is_archived", false).eq("is_completed", false).order("name"),
  ]);
  if (seasonsRes.error || competitionsRes.error) throw new Error(seasonsRes.error?.message ?? competitionsRes.error?.message);
  const seasons = (seasonsRes.data ?? []) as Array<{ id: string; name: string }>;
  const competitions = ((competitionsRes.data ?? []) as PublicCompetition[])
    .filter((competition) => competitionEntriesOpen(competition.signup_deadline));
  const ageRestricted = competitions.flatMap((competition) => {
    const rule = competitionAgeRule(competition.name);
    return rule.minimum !== null || rule.maximum !== null ? [{ id: competition.id, rule }] : [];
  });
  const seasonIds = seasons.map((season) => season.id);
  let teams: Array<{ id: string; name: string; season_id: string; location_id: string | null }> = [];
  if (seasonIds.length) {
    const teamsRes = await client.from("league_teams").select("id,name,season_id,location_id").in("season_id", seasonIds).eq("is_active", true).order("name");
    if (teamsRes.error) throw new Error(teamsRes.error.message);
    teams = (teamsRes.data ?? []) as typeof teams;
  }
  let players: PublicCompetitionPlayer[] = [];
  let partners: PublicCompetitionPartner[] = [];
  const registeredDobs = new Map<string, string>();
  let captainName: string | null = null;
  const selectedTeam = teams.find((team) => team.id === teamId);
  if (selectedTeam) {
    const clubTeams = selectedTeam.location_id
      ? teams.filter((team) => team.location_id === selectedTeam.location_id)
      : [selectedTeam];
    const clubTeamNames = new Map(clubTeams.map((team) => [team.id, team.name]));
    const membersRes = await client.from("league_team_members")
      .select("player_id,team_id,is_captain").in("team_id", [...clubTeamNames.keys()]);
    if (membersRes.error) throw new Error(membersRes.error.message);
    const roster = (membersRes.data ?? []).filter((member) => member.team_id === selectedTeam.id);
    const rosterIds = new Set(roster.map((member) => member.player_id));
    const teamNamesByPlayer = new Map<string, Set<string>>();
    for (const member of membersRes.data ?? []) {
      const teamName = clubTeamNames.get(member.team_id);
      if (!teamName) continue;
      const playerTeams = teamNamesByPlayer.get(member.player_id) ?? new Set();
      playerTeams.add(teamName);
      teamNamesByPlayer.set(member.player_id, playerTeams);
    }

    if (teamNamesByPlayer.size) {
      const [playersRes, linkedUsersRes] = await Promise.all([
        client.from("players").select("id,display_name,full_name,date_of_birth").in("id", [...teamNamesByPlayer.keys()]).eq("is_archived", false).order("display_name"),
        ageRestricted.length && rosterIds.size ? client.from("app_users").select("linked_player_id").in("linked_player_id", [...rosterIds]) : null,
      ]);
      if (playersRes.error) throw new Error(playersRes.error.message);
      if (linkedUsersRes?.error) throw new Error(linkedUsersRes.error.message);
      const linkedIds = new Set(linkedUsersRes?.data?.map((user) => user.linked_player_id));
      partners = (playersRes.data ?? []).map((player) => ({
        id: player.id,
        name: player.full_name?.trim() || player.display_name,
        teamNames: [...(teamNamesByPlayer.get(player.id) ?? [])].sort(),
      }));
      players = (playersRes.data ?? []).filter((player) => rosterIds.has(player.id)).map((player) => {
        const dob = player.date_of_birth;
        const age = dob && linkedIds.has(player.id) ? ageFromDob(dob) : null;
        const ageEligibility: PublicCompetitionPlayer["ageEligibility"] = {};
        if (age !== null) {
          registeredDobs.set(player.id, dob);
          for (const { id, rule } of ageRestricted) {
            ageEligibility[id] = meetsCompetitionAgeRule(age, rule) ? "eligible" : "ineligible";
          }
        }
        return { id: player.id, name: player.full_name?.trim() || player.display_name, ageEligibility };
      });
      const captainId = roster.find((member) => member.is_captain)?.player_id;
      captainName = players.find((player) => player.id === captainId)?.name ?? null;
    }
  }
  return {
    data: { seasons, teams, competitions, players, partners, captainName },
    registeredDobs,
  };
}

export async function GET(req: NextRequest) {
  if (!url || !key) return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers });
  try {
    const client = createClient(url, key);
    const teamId = req.nextUrl.searchParams.get("teamId")?.trim() || undefined;
    const draftToken = req.nextUrl.searchParams.get("draftToken")?.trim() || "";
    const { data } = await formData(client, teamId);
    let draft = null;
    if (/^[a-f0-9]{48}$/i.test(draftToken)) {
      const draftRes = await client.from("public_competition_entry_drafts").select("draft_token,season_id,team_id,contact_name,contact_phone,selections,status,submitted_at,updated_at").eq("draft_token", draftToken).maybeSingle();
      if (draftRes.error) throw new Error(draftRes.error.message);
      draft = draftRes.data;
    }
    return NextResponse.json({ ...data, draft }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Form could not be loaded." }, { status: 400, headers });
  }
}

export async function POST(req: NextRequest) {
  if (!url || !key) return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers });
  try {
    const body = await req.json();
    const action = body?.action === "submit" ? "submit" : "save";
    const draftToken = String(body?.draftToken ?? "").trim().toLowerCase();
    const teamId = String(body?.teamId ?? "").trim();
    const contactName = String(body?.contactName ?? "").trim().slice(0, 140);
    const contactPhone = String(body?.contactPhone ?? "").trim().slice(0, 40);
    if (!/^[a-f0-9]{48}$/.test(draftToken)) throw new Error("The private draft key is invalid. Reload the form and try again.");
    const client = createClient(url, key);
    const { data, registeredDobs } = await formData(client, teamId);
    if (data.competitions.length === 0) throw new Error("Competition entries are currently closed.");
    const team = data.teams.find((item) => item.id === teamId);
    if (!team) throw new Error("Select a valid team.");
    const selections = (Array.isArray(body?.selections) ? body.selections : []) as PublicCompetitionSelection[];
    if (selections.some((selection) => !data.competitions.some((competition) => competition.id === selection.competitionId))) {
      throw new Error("The form includes a competition that is closed. Refresh and try again.");
    }
    const validation = validatePublicSelections(selections, data.competitions, new Set(data.players.map((player) => player.id)), new Set(data.partners.map((player) => player.id)), action === "submit", registeredDobs);
    if (validation) throw new Error(validation);
    if (action === "submit" && (!contactName || contactPhone.replace(/\D/g, "").length < 10)) throw new Error("Enter the captain or team contact name and a valid telephone number.");
    const existingRes = await client.from("public_competition_entry_drafts").select("id,status").eq("draft_token", draftToken).maybeSingle();
    if (existingRes.error) throw new Error(existingRes.error.message);
    if (existingRes.data?.status === "submitted") throw new Error("This competition form has already been submitted.");
    const now = new Date().toISOString();
    const draftSelections = selections.map((selection) => ({
      ...selection,
      entries: selection.entries.map((entry) => registeredDobs.has(entry.playerIds[0])
        ? { ...entry, entrantDateOfBirth: "" }
        : entry),
    }));
    const values = { draft_token: draftToken, season_id: team.season_id, team_id: teamId, contact_name: contactName || null, contact_phone: contactPhone || null, selections: draftSelections, status: "draft", submitted_at: null, updated_at: now };
    let created = 0;
    if (action === "save") {
      const writeRes = existingRes.data
        ? await client.from("public_competition_entry_drafts").update(values).eq("id", existingRes.data.id).eq("status", "draft").select("id").maybeSingle()
        : await client.from("public_competition_entry_drafts").insert(values).select("id").single();
      if (writeRes.error) throw new Error(writeRes.error.message);
      if (!writeRes.data) throw new Error("This competition form has already been submitted.");
    } else {
      const teamPlayers = new Map(data.players.map((player) => [player.id, player]));
      const partnerNames = new Map(data.partners.map((player) => [player.id, player.name]));
      const entries = draftSelections.filter((item) => item.decision === "enter").flatMap((selection) =>
        selection.entries.map((entry) => {
          const [primary, ...teammates] = entry.playerIds;
          return {
            competition_id: selection.competitionId,
            player_id: primary,
            entrant_date_of_birth: teamPlayers.get(primary)?.ageEligibility[selection.competitionId] === "eligible"
              ? registeredDobs.get(primary)
              : entry.entrantDateOfBirth || null,
            note: {
              source: "public_team_competition_form",
              draftToken,
              teamId,
              teamMemberIds: teammates,
              teamMemberNames: teammates.map((id) => partnerNames.get(id) ?? ""),
            },
          };
        }),
      );
      const submit = await client.rpc("submit_public_competition_form", { p_form: values, p_entries: entries });
      if (submit.error) throw new Error(submit.error.message);
      created = submit.data ?? 0;
    }
    return NextResponse.json({ ok: true, status: action === "submit" ? "submitted" : "draft", created }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Form could not be saved." }, { status: 400, headers });
  }
}
