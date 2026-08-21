import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validatePublicSelections, type PublicCompetition, type PublicCompetitionSelection } from "@/lib/public-competition-entry";

export const dynamic = "force-dynamic";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
const today = () => new Date().toISOString().slice(0, 10);

async function formData(client: SupabaseClient, teamId?: string) {
  const [seasonsRes, competitionsRes] = await Promise.all([
    client.from("league_seasons").select("id,name").eq("is_active", true),
    client.from("competitions").select("id,name,match_mode,signup_deadline").eq("competition_format", "knockout").eq("signup_open", true).eq("is_archived", false).eq("is_completed", false).order("name"),
  ]);
  if (seasonsRes.error || competitionsRes.error) throw new Error(seasonsRes.error?.message ?? competitionsRes.error?.message);
  const seasons = (seasonsRes.data ?? []) as Array<{ id: string; name: string }>;
  const competitions = (competitionsRes.data ?? []) as PublicCompetition[];
  const seasonIds = seasons.map((season) => season.id);
  let teams: Array<{ id: string; name: string; season_id: string; location_id: string | null }> = [];
  if (seasonIds.length) {
    const teamsRes = await client.from("league_teams").select("id,name,season_id,location_id").in("season_id", seasonIds).eq("is_active", true).order("name");
    if (teamsRes.error) throw new Error(teamsRes.error.message);
    teams = (teamsRes.data ?? []) as typeof teams;
  }
  let players: Array<{ id: string; name: string }> = [];
  if (teamId && teams.some((team) => team.id === teamId)) {
    const membersRes = await client.from("league_team_members").select("player_id").eq("team_id", teamId);
    if (membersRes.error) throw new Error(membersRes.error.message);
    const ids = ((membersRes.data ?? []) as Array<{ player_id: string }>).map((member) => member.player_id);
    if (ids.length) {
      const playersRes = await client.from("players").select("id,display_name,full_name").in("id", ids).eq("is_archived", false).order("display_name");
      if (playersRes.error) throw new Error(playersRes.error.message);
      players = ((playersRes.data ?? []) as Array<{ id: string; display_name: string; full_name: string | null }>).map((player) => ({ id: player.id, name: player.full_name?.trim() || player.display_name }));
    }
  }
  return {
    seasons,
    teams,
    competitions: competitions.filter((competition) => !competition.signup_deadline || competition.signup_deadline >= today()),
    players,
  };
}

export async function GET(req: NextRequest) {
  if (!url || !key) return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers });
  try {
    const client = createClient(url, key);
    const teamId = req.nextUrl.searchParams.get("teamId")?.trim() || undefined;
    const draftToken = req.nextUrl.searchParams.get("draftToken")?.trim() || "";
    const data = await formData(client, teamId);
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
    const data = await formData(client, teamId);
    const team = data.teams.find((item) => item.id === teamId);
    if (!team) throw new Error("Select a valid team.");
    const selections = (Array.isArray(body?.selections) ? body.selections : []) as PublicCompetitionSelection[];
    const validation = validatePublicSelections(selections, data.competitions as PublicCompetition[], new Set(data.players.map((player) => player.id)), action === "submit");
    if (validation) throw new Error(validation);
    if (action === "submit" && (!contactName || contactPhone.replace(/\D/g, "").length < 10)) throw new Error("Enter the captain or team contact name and a valid telephone number.");
    const existingRes = await client.from("public_competition_entry_drafts").select("id,status").eq("draft_token", draftToken).maybeSingle();
    if (existingRes.error) throw new Error(existingRes.error.message);
    if (existingRes.data?.status === "submitted") throw new Error("This competition form has already been submitted.");
    const now = new Date().toISOString();
    const values = { draft_token: draftToken, season_id: team.season_id, team_id: teamId, contact_name: contactName || null, contact_phone: contactPhone || null, selections, status: "draft", submitted_at: null, updated_at: now };
    const writeRes = existingRes.data ? await client.from("public_competition_entry_drafts").update(values).eq("id", existingRes.data.id) : await client.from("public_competition_entry_drafts").insert(values);
    if (writeRes.error) throw new Error(writeRes.error.message);
    let created = 0;
    if (action === "submit") {
      const playerName = new Map(data.players.map((player) => [player.id, player.name]));
      for (const selection of selections.filter((item) => item.decision === "enter")) {
        for (const entry of selection.entries) {
          const primary = entry.playerIds[0];
          const duplicateRes = await client.from("competition_entries").select("id").eq("competition_id", selection.competitionId).eq("player_id", primary).in("status", ["pending", "approved"]).limit(1);
          if (duplicateRes.error) throw new Error(duplicateRes.error.message);
          if ((duplicateRes.data?.length ?? 0) > 0) continue;
          const teammates = entry.playerIds.slice(1);
          const insertRes = await client.from("competition_entries").insert({ competition_id: selection.competitionId, requester_user_id: null, player_id: primary, entrant_date_of_birth: entry.entrantDateOfBirth || null, status: "pending", note: JSON.stringify({ source: "public_team_competition_form", draftToken, teamId, teamMemberIds: teammates, teamMemberNames: teammates.map((id) => playerName.get(id) ?? "") }) });
          if (insertRes.error) throw new Error(insertRes.error.message);
          created += 1;
        }
      }
      const submittedRes = await client.from("public_competition_entry_drafts").update({ status: "submitted", submitted_at: now, updated_at: now }).eq("draft_token", draftToken).eq("status", "draft");
      if (submittedRes.error) throw new Error(submittedRes.error.message);
    }
    return NextResponse.json({ ok: true, status: action === "submit" ? "submitted" : "draft", created }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Form could not be saved." }, { status: 400, headers });
  }
}
