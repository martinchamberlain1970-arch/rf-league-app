import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { requireLeagueManager } from "@/lib/server-role";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const meetingSlug = "premier-handicap-2026-27-egm";
const noStore = { "Cache-Control": "no-store, max-age=0" };

const proposals = [
  { id: 1, title: "Original Rack & Frame reset", summary: "Reset Premier players to Elo 1000 and handicap 0; first handicap review after four fixture weeks; no start cap." },
  { id: 2, title: "Carry forward and stabilise", summary: "Carry forward validated ratings; review weekly for four weeks then four-weekly; cap the playing start at 40." },
  { id: 3, title: "Carry forward with 40-point pairing variance", summary: "Carry forward validated ratings; four-weekly reviews; pair players within 40 points where possible; use the full playing start." },
];

function cleanText(value: unknown, length = 120) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, length);
}

async function authorize(req: NextRequest): Promise<{ admin: SupabaseClient; user: User }> {
  if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("SERVER_NOT_CONFIGURED");
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("UNAUTHORIZED");
  const auth = createClient(supabaseUrl, anonKey);
  const userRes = await auth.auth.getUser(token);
  if (userRes.error || !userRes.data.user) throw new Error("UNAUTHORIZED");
  const admin = createClient(supabaseUrl, serviceKey);
  await requireLeagueManager(admin, userRes.data.user);
  return { admin, user: userRes.data.user };
}

async function meetingFor(admin: SupabaseClient) {
  const result = await admin.from("handicap_egm_meetings")
    .select("id,consultation_id,slug,public_token,title,season_label,meeting_at,status,runoff_proposals,adopted_proposal,decision_note,completed_at,updated_at")
    .eq("slug", meetingSlug).single();
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

async function responsePayload(admin: SupabaseClient) {
  const meeting = await meetingFor(admin);
  const [seasonsRes, attendeesRes, votesRes, consultationRes] = await Promise.all([
    admin.from("league_seasons").select("id,name").ilike("name", "%Premier League 2026/2027%").order("created_at", { ascending: false }).limit(1),
    admin.from("handicap_egm_attendees").select("id,team_id,location_id,representative_name,created_at,updated_at").eq("meeting_id", meeting.id).order("created_at"),
    admin.from("handicap_egm_votes").select("id,attendee_id,round_no,choice,submission_method,recorded_at,updated_at").eq("meeting_id", meeting.id).order("recorded_at"),
    admin.from("handicap_consultation_attestations").select("id", { count: "exact", head: true }).eq("consultation_id", meeting.consultation_id),
  ]);
  const error = seasonsRes.error || attendeesRes.error || votesRes.error || consultationRes.error;
  if (error) throw new Error(error.message);
  const season = seasonsRes.data?.[0] ?? null;
  const teamsRes = season
    ? await admin.from("league_teams").select("id,name,location_id,is_active").eq("season_id", season.id).eq("is_active", true).order("name")
    : { data: [], error: null };
  if (teamsRes.error) throw new Error(teamsRes.error.message);
  const locationIds = [...new Set((teamsRes.data ?? []).map((team) => team.location_id).filter(Boolean))];
  const locationsRes = locationIds.length
    ? await admin.from("locations").select("id,name").in("id", locationIds)
    : { data: [], error: null };
  if (locationsRes.error) throw new Error(locationsRes.error.message);
  const teamName = new Map((teamsRes.data ?? []).map((team) => [team.id, team.name]));
  const clubName = new Map((locationsRes.data ?? []).map((club) => [club.id, club.name]));
  return {
    meeting,
    proposals,
    season,
    attestationCount: consultationRes.count ?? 0,
    teams: (teamsRes.data ?? []).map((team) => ({ ...team, clubName: clubName.get(team.location_id) ?? "Unknown club" })),
    attendees: (attendeesRes.data ?? []).map((attendee) => ({
      id: attendee.id,
      team_id: attendee.team_id,
      location_id: attendee.location_id,
      representative_name: attendee.representative_name,
      created_at: attendee.created_at,
      updated_at: attendee.updated_at,
      teamName: teamName.get(attendee.team_id) ?? "Unknown team",
      clubName: clubName.get(attendee.location_id) ?? "Unknown club",
    })),
    votes: (votesRes.data ?? []).map((vote) => ({
      ...vote,
      choice: (meeting.status === "round_1_open" && vote.round_no === 1) || (meeting.status === "round_2_open" && vote.round_no === 2)
        ? null
        : vote.choice,
    })),
  };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "The EGM record could not be updated.";
  if (message === "SERVER_NOT_CONFIGURED") return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers: noStore });
  if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: noStore });
  if (message === "FORBIDDEN_LEAGUE_MANAGER") return NextResponse.json({ error: "League Secretary, Chairman or Treasurer access is required." }, { status: 403, headers: noStore });
  if (message.includes("handicap_egm_")) return NextResponse.json({ error: "EGM voting is not enabled yet. Run the latest Supabase migration, then reload this screen." }, { status: 503, headers: noStore });
  return NextResponse.json({ error: message }, { status: 400, headers: noStore });
}

export async function GET(req: NextRequest) {
  try {
    const { admin } = await authorize(req);
    return NextResponse.json(await responsePayload(admin), { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { admin, user } = await authorize(req);
    const body = await req.json().catch(() => ({}));
    const action = cleanText(body?.action, 40);
    const meeting = await meetingFor(admin);
    if (action === "add_attendee") {
      if (meeting.status !== "register_open") throw new Error("Attendance can only be changed before round one opens.");
      const teamId = cleanText(body?.teamId, 60);
      const representativeName = cleanText(body?.representativeName);
      if (!teamId || representativeName.split(" ").filter(Boolean).length < 2) throw new Error("Select a team and enter the representative's full name.");
      const teamRes = await admin.from("league_teams").select("id,location_id,is_active,season_id").eq("id", teamId).maybeSingle();
      if (teamRes.error || !teamRes.data) throw new Error(teamRes.error?.message ?? "The selected team was not found.");
      const seasonRes = await admin.from("league_seasons").select("name").eq("id", teamRes.data.season_id).maybeSingle();
      if (seasonRes.error || !seasonRes.data) throw new Error(seasonRes.error?.message ?? "The selected team's league was not found.");
      const seasonName = seasonRes.data.name ?? "";
      if (!teamRes.data.is_active || !seasonName.toLowerCase().includes("premier league 2026/2027")) throw new Error("Select an active 2026/2027 Premier League team.");
      if (!teamRes.data.location_id) throw new Error("This team is not linked to a club.");
      const clubAttendees = await admin.from("handicap_egm_attendees").select("id", { count: "exact", head: true }).eq("meeting_id", meeting.id).eq("location_id", teamRes.data.location_id);
      if (clubAttendees.error) throw new Error(clubAttendees.error.message);
      if ((clubAttendees.count ?? 0) >= 2) throw new Error("This club already has two voting representatives, which is the Rule 8 maximum.");
      const insert = await admin.from("handicap_egm_attendees").insert({
        meeting_id: meeting.id,
        team_id: teamId,
        location_id: teamRes.data.location_id,
        representative_name: representativeName,
      }).select("id").single();
      if (insert.error?.code === "23505") throw new Error("That representative has already been recorded for this club.");
      if (insert.error) throw new Error(insert.error.message);
    } else if (action === "remove_attendee") {
      if (meeting.status !== "register_open") throw new Error("Attendance can only be changed before round one opens.");
      const attendeeId = cleanText(body?.attendeeId, 60);
      const deleted = await admin.from("handicap_egm_attendees").delete().eq("id", attendeeId).eq("meeting_id", meeting.id);
      if (deleted.error) throw new Error(deleted.error.message);
    } else if (action === "set_meeting") {
      if (meeting.status !== "register_open") throw new Error("The meeting date can only be changed before voting opens.");
      const meetingAt = cleanText(body?.meetingAt, 80);
      const parsed = meetingAt ? new Date(meetingAt) : null;
      if (meetingAt && (!parsed || Number.isNaN(parsed.getTime()))) throw new Error("Enter a valid EGM date and time.");
      const updated = await admin.from("handicap_egm_meetings").update({ meeting_at: parsed?.toISOString() ?? null, updated_at: new Date().toISOString() }).eq("id", meeting.id);
      if (updated.error) throw new Error(updated.error.message);
    } else if (action === "set_status") {
      const nextStatus = cleanText(body?.status, 40);
      const allowed: Record<string, string[]> = {
        register_open: ["round_1_open"],
        round_1_open: ["round_1_closed"],
        round_1_closed: ["round_2_open", "completed"],
        round_2_open: ["round_2_closed"],
        round_2_closed: ["completed"],
      };
      if (!allowed[meeting.status]?.includes(nextStatus)) throw new Error("That is not a valid next step for this EGM.");
      const attendeeCount = await admin.from("handicap_egm_attendees").select("id", { count: "exact", head: true }).eq("meeting_id", meeting.id);
      if (attendeeCount.error) throw new Error(attendeeCount.error.message);
      if (nextStatus === "round_1_open" && (attendeeCount.count ?? 0) === 0) throw new Error("Record the voting representatives before opening round one.");
      if (nextStatus === "round_1_closed" || nextStatus === "round_2_closed") {
        const roundNo = nextStatus === "round_1_closed" ? 1 : 2;
        const voteCount = await admin.from("handicap_egm_votes").select("id", { count: "exact", head: true }).eq("meeting_id", meeting.id).eq("round_no", roundNo);
        if (voteCount.error) throw new Error(voteCount.error.message);
        if ((voteCount.count ?? 0) !== (attendeeCount.count ?? 0)) throw new Error(`Record a vote or abstention for every representative before closing round ${roundNo}.`);
      }
      const update: Record<string, unknown> = { status: nextStatus, updated_at: new Date().toISOString() };
      if (nextStatus === "round_2_open") {
        const submittedRunoff: unknown[] = Array.isArray(body?.runoffProposals) ? body.runoffProposals : [];
        const runoff = Array.from(new Set(submittedRunoff.map((value) => Number(value)))).filter((value) => value >= 1 && value <= 3);
        if (runoff.length !== 2) throw new Error("Select exactly two proposals for the second ballot.");
        update.runoff_proposals = runoff;
      }
      if (nextStatus === "completed") {
        const adopted = Number(body?.adoptedProposal);
        if (![1, 2, 3].includes(adopted)) throw new Error("Select the proposal adopted by the meeting.");
        update.adopted_proposal = adopted;
        update.decision_note = cleanText(body?.decisionNote, 500) || null;
        update.completed_at = new Date().toISOString();
      }
      const changed = await admin.from("handicap_egm_meetings").update(update).eq("id", meeting.id);
      if (changed.error) throw new Error(changed.error.message);
    } else if (action === "clear_vote") {
      const roundNo = Number(body?.roundNo);
      const expectedStatus = roundNo === 1 ? "round_1_open" : "round_2_open";
      if (meeting.status !== expectedStatus) throw new Error(`Ballot round ${roundNo} is not open.`);
      const attendeeId = cleanText(body?.attendeeId, 60);
      const deleted = await admin.from("handicap_egm_votes").delete().eq("meeting_id", meeting.id).eq("attendee_id", attendeeId).eq("round_no", roundNo);
      if (deleted.error) throw new Error(deleted.error.message);
    } else if (action === "record_vote") {
      const roundNo = Number(body?.roundNo);
      const expectedStatus = roundNo === 1 ? "round_1_open" : "round_2_open";
      if (meeting.status !== expectedStatus) throw new Error(`Ballot round ${roundNo} is not open.`);
      const attendeeId = cleanText(body?.attendeeId, 60);
      const choice = cleanText(body?.choice, 20);
      const validChoices = roundNo === 2
        ? [...(meeting.runoff_proposals ?? []).map((id: number) => `proposal_${id}`), "abstain"]
        : ["proposal_1", "proposal_2", "proposal_3", "abstain"];
      if (!attendeeId || !validChoices.includes(choice)) throw new Error("Select a valid vote for the open ballot.");
      const attendee = await admin.from("handicap_egm_attendees").select("id").eq("id", attendeeId).eq("meeting_id", meeting.id).maybeSingle();
      if (attendee.error || !attendee.data) throw new Error(attendee.error?.message ?? "The voting representative was not found.");
      const saved = await admin.from("handicap_egm_votes").upsert({
        meeting_id: meeting.id,
        attendee_id: attendeeId,
        round_no: roundNo,
        choice,
        submission_method: "officer",
        recorded_by_user_id: user.id,
        recorded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "meeting_id,attendee_id,round_no" });
      if (saved.error) throw new Error(saved.error.message);
    } else {
      throw new Error("Choose a valid EGM action.");
    }

    return NextResponse.json(await responsePayload(admin), { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}
