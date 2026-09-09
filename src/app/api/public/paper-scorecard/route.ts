import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sendPushToLeagueManagers } from "@/lib/push-server";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const noStore = { "Cache-Control": "no-store, max-age=0" };
const bucket = "temporary-scorecards";
const maxFileSize = 6 * 1024 * 1024;
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type FrameInput = {
  slot_no?: number;
  slot_type?: "singles" | "doubles";
  winner_side?: "home" | "away";
  home_player1_id?: string | null;
  home_player2_id?: string | null;
  away_player1_id?: string | null;
  away_player2_id?: string | null;
  home_forfeit?: boolean;
  away_forfeit?: boolean;
  home_points_scored?: number | null;
  away_points_scored?: number | null;
  break_entries?: Array<{ player_id?: string | null; break_value?: number }>;
};

function clean(value: unknown, max = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function londonDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function adminClient() {
  if (!supabaseUrl || !serviceKey) throw new Error("SERVER_NOT_CONFIGURED");
  return createClient(supabaseUrl, serviceKey);
}

function errorResponse(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "The paper scorecard could not be submitted.";
  if (message === "SERVER_NOT_CONFIGURED") return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers: noStore });
  if (message.toLowerCase().includes("submission_source") || message.toLowerCase().includes("scorecard_photo_path")) {
    return NextResponse.json({ error: "Paper scorecard entry is not enabled yet. Run the latest Supabase migration and try again." }, { status: 503, headers: noStore });
  }
  return NextResponse.json({ error: message }, { status, headers: noStore });
}

function requestFingerprint(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const agent = req.headers.get("user-agent") ?? "unknown";
  const salt = serviceKey?.slice(-24) ?? "rack-frame";
  return createHash("sha256").update(`${forwarded}|${agent}|${salt}`).digest("hex");
}

async function purgeExpiredEvidence(admin: SupabaseClient) {
  const expired = await admin
    .from("league_result_submissions")
    .select("id,scorecard_photo_path")
    .eq("submission_source", "public_paper")
    .not("scorecard_photo_path", "is", null)
    .lt("scorecard_evidence_expires_at", new Date().toISOString())
    .limit(30);
  if (expired.error) return;
  const paths = (expired.data ?? []).map((row) => row.scorecard_photo_path).filter(Boolean) as string[];
  if (!paths.length) return;
  const removed = await admin.storage.from(bucket).remove(paths);
  if (removed.error) return;
  await admin.from("league_result_submissions").update({ scorecard_photo_path: null, scorecard_evidence_deleted_at: new Date().toISOString() }).in("id", (expired.data ?? []).map((row) => row.id));
}

export async function GET() {
  try {
    const admin = adminClient();
    void purgeExpiredEvidence(admin);
    const seasonsRes = await admin
      .from("league_seasons")
      .select("id,name")
      .eq("is_active", true)
      .eq("is_published", true)
      .order("created_at", { ascending: false });
    if (seasonsRes.error) throw new Error(seasonsRes.error.message);
    const seasons = seasonsRes.data ?? [];
    const seasonIds = seasons.map((season) => season.id);
    if (!seasonIds.length) return NextResponse.json({ seasons: [], fixtures: [], teams: [], frames: [], rosters: {} }, { headers: noStore });

    const earliest = new Date();
    earliest.setDate(earliest.getDate() - 31);
    const latest = new Date();
    latest.setDate(latest.getDate() + 7);
    const fixturesRes = await admin
      .from("league_fixtures")
      .select("id,season_id,week_no,fixture_date,home_team_id,away_team_id,status")
      .in("season_id", seasonIds)
      .gte("fixture_date", earliest.toISOString().slice(0, 10))
      .lte("fixture_date", latest.toISOString().slice(0, 10))
      .neq("status", "complete")
      .neq("status", "bye")
      .order("fixture_date")
      .order("week_no");
    if (fixturesRes.error) throw new Error(fixturesRes.error.message);
    const fixtures = fixturesRes.data ?? [];
    const fixtureIds = fixtures.map((fixture) => fixture.id);
    const teamIds = [...new Set(fixtures.flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id]))];

    const [teamsRes, framesRes, membersRes, openRes] = await Promise.all([
      teamIds.length ? admin.from("league_teams").select("id,name").in("id", teamIds) : Promise.resolve({ data: [], error: null }),
      fixtureIds.length ? admin.from("league_fixture_frames").select("fixture_id,slot_no,slot_type").in("fixture_id", fixtureIds).order("slot_no") : Promise.resolve({ data: [], error: null }),
      teamIds.length ? admin.from("league_team_members").select("team_id,player_id").in("team_id", teamIds).in("season_id", seasonIds) : Promise.resolve({ data: [], error: null }),
      fixtureIds.length ? admin.from("league_result_submissions").select("fixture_id,status").in("fixture_id", fixtureIds).in("status", ["pending", "approved"]) : Promise.resolve({ data: [], error: null }),
    ]);
    const queryError = teamsRes.error || framesRes.error || membersRes.error || openRes.error;
    if (queryError) throw new Error(queryError.message);
    const members = membersRes.data ?? [];
    const playerIds = [...new Set(members.map((member) => member.player_id).filter(Boolean))];
    const playersRes = playerIds.length
      ? await admin.from("players").select("id,display_name,full_name").in("id", playerIds).eq("is_archived", false)
      : { data: [], error: null };
    if (playersRes.error) throw new Error(playersRes.error.message);
    const playerNames = new Map((playersRes.data ?? []).map((player) => [player.id, clean(player.full_name || player.display_name)]));
    const rosters = Object.fromEntries(teamIds.map((teamId) => [
      teamId,
      members
        .filter((member) => member.team_id === teamId && playerNames.has(member.player_id))
        .map((member) => ({ id: member.player_id, name: playerNames.get(member.player_id)! }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ]));
    const blocked = new Set((openRes.data ?? []).map((row) => row.fixture_id));
    const today = londonDate();
    return NextResponse.json({
      seasons,
      fixtures: fixtures.map((fixture) => ({
        ...fixture,
        submissionOpen: fixture.fixture_date <= today && !blocked.has(fixture.id),
        submissionStatus: blocked.has(fixture.id) ? "already_submitted" : fixture.fixture_date > today ? "not_open_yet" : "available",
      })),
      teams: teamsRes.data ?? [],
      frames: framesRes.data ?? [],
      rosters,
    }, { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  let uploadedPath = "";
  try {
    const admin = adminClient();
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin) throw new Error("This form must be submitted from Rack & Frame.");
    const form = await req.formData();
    if (clean(form.get("website"))) throw new Error("Submission could not be accepted.");
    const fixtureId = clean(form.get("fixtureId"), 60);
    const submitterTeamId = clean(form.get("submitterTeamId"), 60);
    const submitterName = clean(form.get("submitterName"), 120);
    const confirmed = form.get("bothTeamsConfirmed") === "true";
    if (!fixtureId || !submitterTeamId || submitterName.split(" ").filter(Boolean).length < 2 || !confirmed) {
      throw new Error("Select the fixture and submitting team, enter your full name and confirm that both teams agree with the scorecard.");
    }
    let inputFrames: FrameInput[];
    try { inputFrames = JSON.parse(clean(form.get("frameResults"), 30000)); } catch { throw new Error("The frame results could not be read."); }
    if (!Array.isArray(inputFrames)) throw new Error("The frame results could not be read.");

    const fixtureRes = await admin.from("league_fixtures").select("id,season_id,fixture_date,home_team_id,away_team_id,status").eq("id", fixtureId).maybeSingle();
    if (fixtureRes.error || !fixtureRes.data) throw new Error("The selected fixture was not found.");
    const fixture = fixtureRes.data;
    if (fixture.status === "complete" || fixture.status === "bye") throw new Error("This fixture is already closed to submissions.");
    if (![fixture.home_team_id, fixture.away_team_id].includes(submitterTeamId)) throw new Error("Select one of the teams playing in this fixture.");
    const seasonRes = await admin.from("league_seasons").select("id,is_active,is_published").eq("id", fixture.season_id).maybeSingle();
    if (seasonRes.error || !seasonRes.data?.is_active || !seasonRes.data.is_published) throw new Error("This league is not currently open for result submissions.");
    if (!fixture.fixture_date || fixture.fixture_date > londonDate()) throw new Error("This fixture is not open for result submission yet.");

    const existing = await admin.from("league_result_submissions").select("id,status").eq("fixture_id", fixtureId).in("status", ["pending", "approved"]).limit(1);
    if (existing.error) throw new Error(existing.error.message);
    if ((existing.data ?? []).length) throw new Error("A result for this fixture has already been submitted or approved.");

    const fingerprint = requestFingerprint(req);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const attempts = await admin.from("league_result_submissions").select("id", { count: "exact", head: true }).eq("submission_source", "public_paper").eq("public_submission_fingerprint", fingerprint).gte("created_at", oneHourAgo);
    if (attempts.error) throw new Error(attempts.error.message);
    if ((attempts.count ?? 0) >= 5) throw new Error("Too many recent submissions were made from this device. Please contact the League Secretary.");

    const [slotsRes, membersRes] = await Promise.all([
      admin.from("league_fixture_frames").select("slot_no,slot_type").eq("fixture_id", fixtureId).order("slot_no"),
      admin.from("league_team_members").select("team_id,player_id").eq("season_id", fixture.season_id).in("team_id", [fixture.home_team_id, fixture.away_team_id]),
    ]);
    const validationError = slotsRes.error || membersRes.error;
    if (validationError) throw new Error(validationError.message);
    const slots = slotsRes.data ?? [];
    if (inputFrames.length !== slots.length || !slots.length) throw new Error("Complete every frame shown on the scorecard.");
    const homeRoster = new Set((membersRes.data ?? []).filter((row) => row.team_id === fixture.home_team_id).map((row) => row.player_id));
    const awayRoster = new Set((membersRes.data ?? []).filter((row) => row.team_id === fixture.away_team_id).map((row) => row.player_id));
    const cleanFrames = slots.map((slot) => {
      const row = inputFrames.find((item) => Number(item.slot_no) === Number(slot.slot_no));
      if (!row || !["home", "away"].includes(row.winner_side ?? "")) throw new Error(`Select the winner of frame ${slot.slot_no}.`);
      const homeForfeit = Boolean(row.home_forfeit);
      const awayForfeit = Boolean(row.away_forfeit);
      if (homeForfeit && awayForfeit) throw new Error(`Both teams cannot be marked as a no show in frame ${slot.slot_no}.`);
      if (homeForfeit && row.winner_side !== "away") throw new Error(`Frame ${slot.slot_no} must be awarded to the away team when the home player is a no show.`);
      if (awayForfeit && row.winner_side !== "home") throw new Error(`Frame ${slot.slot_no} must be awarded to the home team when the away player is a no show.`);
      const doubles = slot.slot_type === "doubles";
      const homeIds = [clean(row.home_player1_id, 60), clean(row.home_player2_id, 60)].filter(Boolean);
      const awayIds = [clean(row.away_player1_id, 60), clean(row.away_player2_id, 60)].filter(Boolean);
      if (!homeForfeit && (homeIds.length !== (doubles ? 2 : 1) || homeIds.some((id) => !homeRoster.has(id)))) throw new Error(`Select the ${doubles ? "two home players" : "home player"} from the current roster for frame ${slot.slot_no}.`);
      if (!awayForfeit && (awayIds.length !== (doubles ? 2 : 1) || awayIds.some((id) => !awayRoster.has(id)))) throw new Error(`Select the ${doubles ? "two away players" : "away player"} from the current roster for frame ${slot.slot_no}.`);
      if (new Set(homeIds).size !== homeIds.length || new Set(awayIds).size !== awayIds.length) throw new Error(`The same player cannot occupy both positions in frame ${slot.slot_no}.`);
      const homeScore = homeForfeit || awayForfeit ? null : (typeof row.home_points_scored === "number" ? row.home_points_scored : Number.NaN);
      const awayScore = homeForfeit || awayForfeit ? null : (typeof row.away_points_scored === "number" ? row.away_points_scored : Number.NaN);
      if (!homeForfeit && !awayForfeit && (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore! < 0 || awayScore! < 0 || homeScore === awayScore)) throw new Error(`Enter valid, different final scores for frame ${slot.slot_no}.`);
      if (!homeForfeit && !awayForfeit && ((homeScore! > awayScore! ? "home" : "away") !== row.winner_side)) throw new Error(`The selected winner does not match the score in frame ${slot.slot_no}.`);
      const participants = new Set([...homeIds, ...awayIds]);
      const breaks = (row.break_entries ?? []).map((entry) => ({
        slot_no: Number(slot.slot_no),
        player_id: clean(entry.player_id, 60) || null,
        entered_player_name: null,
        break_value: Number(entry.break_value),
      })).filter((entry) => {
        if (!entry.player_id && !entry.break_value) return false;
        if (!entry.player_id || !participants.has(entry.player_id) || !Number.isInteger(entry.break_value) || entry.break_value < 30 || entry.break_value > 147) throw new Error(`Check the 30+ break entered for frame ${slot.slot_no}.`);
        return true;
      });
      return {
        slot_no: Number(slot.slot_no),
        slot_type: doubles ? "doubles" : "singles",
        winner_side: row.winner_side,
        home_player1_id: homeIds[0] ?? null,
        home_player2_id: doubles ? homeIds[1] ?? null : null,
        away_player1_id: awayIds[0] ?? null,
        away_player2_id: doubles ? awayIds[1] ?? null : null,
        home_nominated: false,
        away_nominated: false,
        home_forfeit: homeForfeit,
        away_forfeit: awayForfeit,
        home_nominated_name: null,
        away_nominated_name: null,
        home_points_scored: homeScore,
        away_points_scored: awayScore,
        break_entries: breaks,
      };
    });

    const file = form.get("scorecardPhoto");
    let originalName: string | null = null;
    let mimeType: string | null = null;
    let expiresAt: string | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > maxFileSize) throw new Error("The scorecard photograph must be no larger than 6 MB.");
      if (!allowedMimeTypes.has(file.type)) throw new Error("Upload a JPEG, PNG or WebP scorecard photograph.");
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      uploadedPath = `${fixture.season_id}/${fixtureId}/${randomUUID()}.${extension}`;
      const uploaded = await admin.storage.from(bucket).upload(uploadedPath, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false });
      if (uploaded.error) throw new Error(uploaded.error.message);
      originalName = clean(file.name, 180);
      mimeType = file.type;
      expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    }

    const inserted = await admin.from("league_result_submissions").insert({
      fixture_id: fixture.id,
      season_id: fixture.season_id,
      submitted_by_user_id: null,
      submitter_team_id: submitterTeamId,
      frame_results: cleanFrames,
      scorecard_photo_url: null,
      status: "pending",
      submission_source: "public_paper",
      public_submitter_name: submitterName,
      public_submitter_team_id: submitterTeamId,
      public_both_teams_confirmed: true,
      public_submission_fingerprint: fingerprint,
      scorecard_photo_path: uploadedPath || null,
      scorecard_photo_mime_type: mimeType,
      scorecard_photo_original_name: originalName,
      scorecard_evidence_expires_at: expiresAt,
    }).select("id").single();
    if (inserted.error) {
      if (uploadedPath) await admin.storage.from(bucket).remove([uploadedPath]);
      throw new Error(inserted.error.code === "23505" ? "A result for this fixture has already been submitted." : inserted.error.message);
    }

    await sendPushToLeagueManagers(admin, {
      title: "Paper scorecard awaiting approval",
      body: `${submitterName} submitted a public paper scorecard for review.`,
      url: "/results?tab=league",
      tag: `public-paper-scorecard-${fixture.id}`,
    });
    return NextResponse.json({ ok: true, submissionId: inserted.data.id }, { headers: noStore });
  } catch (error) {
    if (uploadedPath && supabaseUrl && serviceKey) {
      const admin = createClient(supabaseUrl, serviceKey);
      await admin.storage.from(bucket).remove([uploadedPath]);
    }
    return errorResponse(error);
  }
}
