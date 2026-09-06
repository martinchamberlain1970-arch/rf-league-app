import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const noStore = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

const proposals = [
  { id: 1, title: "Original Rack & Frame reset", summary: "Reset Premier players to Elo 1000 and handicap 0; first handicap review after four fixture weeks; no start cap." },
  { id: 2, title: "Carry forward and stabilise", summary: "Carry forward validated ratings; review weekly for four weeks then four-weekly; cap the playing start at 40." },
  { id: 3, title: "Carry forward with 40-point pairing variance", summary: "Carry forward validated ratings; four-weekly reviews; pair players within 40 points where possible; use the full playing start." },
];

type Context = { params: Promise<{ token: string }> };

function cleanText(value: unknown, length = 120) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, length);
}

async function getMeeting(admin: SupabaseClient, token: string) {
  const result = await admin.from("handicap_egm_meetings")
    .select("id,title,season_label,meeting_at,status,runoff_proposals,completed_at")
    .eq("public_token", token)
    .maybeSingle();
  if (result.error) {
    if (result.error.code === "42P01" || result.error.message.includes("public_token")) throw new Error("NOT_ENABLED");
    throw new Error(result.error.message);
  }
  if (!result.data) throw new Error("NOT_FOUND");
  return result.data;
}

function publicMeeting(meeting: Awaited<ReturnType<typeof getMeeting>>) {
  const activeRound = meeting.status === "round_1_open" ? 1 : meeting.status === "round_2_open" ? 2 : null;
  const allowedProposalIds = activeRound === 2 ? meeting.runoff_proposals : activeRound === 1 ? [1, 2, 3] : [];
  return {
    title: meeting.title,
    seasonLabel: meeting.season_label,
    meetingAt: meeting.meeting_at,
    status: meeting.status,
    activeRound,
    proposals: proposals.filter((proposal) => allowedProposalIds.includes(proposal.id)),
  };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "The ballot could not be loaded.";
  if (message === "NOT_ENABLED") return NextResponse.json({ error: "Online EGM voting has not been enabled yet." }, { status: 503, headers: noStore });
  if (message === "NOT_FOUND") return NextResponse.json({ error: "This EGM voting link is not valid." }, { status: 404, headers: noStore });
  return NextResponse.json({ error: message }, { status: 400, headers: noStore });
}

export async function GET(_req: NextRequest, context: Context) {
  if (!supabaseUrl || !serviceKey) return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers: noStore });
  try {
    const { token } = await context.params;
    const admin = createClient(supabaseUrl, serviceKey);
    const meeting = await getMeeting(admin, cleanText(token, 80));
    const attendeesRes = await admin.from("handicap_egm_attendees").select("id,team_id,location_id,representative_name").eq("meeting_id", meeting.id).order("representative_name");
    if (attendeesRes.error) throw new Error(attendeesRes.error.message);
    const teamIds = [...new Set((attendeesRes.data ?? []).map((row) => row.team_id))];
    const locationIds = [...new Set((attendeesRes.data ?? []).map((row) => row.location_id))];
    const [teamsRes, locationsRes] = await Promise.all([
      teamIds.length ? admin.from("league_teams").select("id,name").in("id", teamIds) : Promise.resolve({ data: [], error: null }),
      locationIds.length ? admin.from("locations").select("id,name").in("id", locationIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (teamsRes.error || locationsRes.error) throw new Error(teamsRes.error?.message ?? locationsRes.error?.message ?? "Attendance could not be loaded.");
    const teamName = new Map((teamsRes.data ?? []).map((row) => [row.id, row.name]));
    const clubName = new Map((locationsRes.data ?? []).map((row) => [row.id, row.name]));
    const attendees = (attendeesRes.data ?? []).map((row) => ({ id: row.id, name: row.representative_name, teamName: teamName.get(row.team_id) ?? "Unknown team", clubName: clubName.get(row.location_id) ?? "Unknown club" }));
    return NextResponse.json({ meeting: publicMeeting(meeting), attendees }, { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest, context: Context) {
  if (!supabaseUrl || !serviceKey) return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers: noStore });
  try {
    const body = await req.json().catch(() => ({}));
    if (cleanText(body?.website, 200)) return NextResponse.json({ ok: true }, { headers: noStore });
    const attendeeId = cleanText(body?.attendeeId, 60);
    const choice = cleanText(body?.choice, 20);
    if (!attendeeId || body?.identityConfirmed !== true) throw new Error("Select your name and confirm the displayed team and club.");

    const { token } = await context.params;
    const admin = createClient(supabaseUrl, serviceKey);
    const meeting = await getMeeting(admin, cleanText(token, 80));
    const roundNo = meeting.status === "round_1_open" ? 1 : meeting.status === "round_2_open" ? 2 : null;
    if (!roundNo) throw new Error(meeting.status === "completed" ? "This EGM has been completed." : "The ballot is not currently open.");
    const allowedChoices = roundNo === 2
      ? [...meeting.runoff_proposals.map((id: number) => `proposal_${id}`), "abstain"]
      : ["proposal_1", "proposal_2", "proposal_3", "abstain"];
    if (!allowedChoices.includes(choice)) throw new Error("Select one of the available proposals or abstain.");

    const attendeeRes = await admin.from("handicap_egm_attendees")
      .select("id,representative_name")
      .eq("meeting_id", meeting.id)
      .eq("id", attendeeId)
      .maybeSingle();
    if (attendeeRes.error) throw new Error(attendeeRes.error.message);
    if (!attendeeRes.data) throw new Error("That representative is not on the confirmed attendance register.");

    const insert = await admin.from("handicap_egm_votes").insert({
      meeting_id: meeting.id,
      attendee_id: attendeeRes.data.id,
      round_no: roundNo,
      choice,
      submission_method: "attendee",
      recorded_by_user_id: null,
    });
    if (insert.error?.code === "23505") return NextResponse.json({ error: `Your ballot ${roundNo} vote has already been recorded.` }, { status: 409, headers: noStore });
    if (insert.error) throw new Error(insert.error.message);
    return NextResponse.json({ ok: true, roundNo, representativeName: attendeeRes.data.representative_name }, { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}
