import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { expectedLeagueScorecardFrames, validateCompleteLeagueScorecard } from "@/lib/league-scorecard-validation";
import { sendPushToLeagueManagers, sendPushToUserIds } from "@/lib/push-server";
import { fetchAllSupabasePages, fetchAllSupabasePagesByChunks } from "@/lib/supabase-pagination";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store, max-age=0" };
const REMINDER_ACTION = "league_scorecard_submission_reminder_attempted";
const MINIMUM_HOURS_AFTER_FINAL_SAVE = 6;

function londonDate(daysAgo: number, now: Date) {
  const shifted = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(shifted);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: noStore });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers: noStore });
  }

  try {
    const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const now = new Date();
    const oldestDate = londonDate(7, now);
    const yesterday = londonDate(1, now);
    const seasons = await client.from("league_seasons").select("id,singles_count,doubles_count").eq("is_active", true).eq("is_published", true);
    if (seasons.error) throw new Error(seasons.error.message);
    const seasonById = new Map((seasons.data ?? []).map((row) => [row.id, row]));
    if (!seasonById.size) return NextResponse.json({ checked: 0, reminded: 0 }, { headers: noStore });

    const fixtures = await fetchAllSupabasePages((from, to) => client
      .from("league_fixtures")
      .select("id,season_id,fixture_date,home_team_id,away_team_id")
      .in("season_id", [...seasonById.keys()])
      .eq("status", "in_progress")
      .gte("fixture_date", oldestDate)
      .lte("fixture_date", yesterday)
      .order("id", { ascending: true })
      .range(from, to));
    if (fixtures.error) throw new Error(fixtures.error.message);
    const candidates = fixtures.data ?? [];
    if (!candidates.length) return NextResponse.json({ checked: 0, reminded: 0 }, { headers: noStore });

    const fixtureIds = candidates.map((fixture) => fixture.id);
    const [frames, submissions, alreadyReminded, teams] = await Promise.all([
      fetchAllSupabasePagesByChunks(fixtureIds, (ids, from, to) => client
        .from("league_fixture_frames")
        .select("fixture_id,slot_no,slot_type,winner_side,home_forfeit,away_forfeit,home_points_scored,away_points_scored")
        .in("fixture_id", ids).order("id", { ascending: true }).range(from, to)),
      fetchAllSupabasePagesByChunks(fixtureIds, (ids, from, to) => client
        .from("league_result_submissions")
        .select("fixture_id,status")
        .in("fixture_id", ids).in("status", ["pending", "approved"])
        .order("id", { ascending: true }).range(from, to)),
      fetchAllSupabasePagesByChunks(fixtureIds, (ids, from, to) => client
        .from("audit_logs")
        .select("entity_id")
        .eq("action", REMINDER_ACTION).in("entity_id", ids)
        .order("id", { ascending: true }).range(from, to)),
      fetchAllSupabasePagesByChunks([...new Set(candidates.flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id]))], (ids, from, to) => client
        .from("league_teams").select("id,name").in("id", ids)
        .order("id", { ascending: true }).range(from, to)),
    ]);
    for (const result of [frames, submissions, alreadyReminded, teams]) {
      if (result.error) throw new Error(result.error.message);
    }
    const framesByFixture = new Map<string, NonNullable<typeof frames.data>>();
    for (const frame of frames.data ?? []) {
      const rows = framesByFixture.get(frame.fixture_id) ?? [];
      rows.push(frame);
      framesByFixture.set(frame.fixture_id, rows);
    }
    const submittedIds = new Set((submissions.data ?? []).map((row) => row.fixture_id));
    const remindedIds = new Set((alreadyReminded.data ?? []).map((row) => row.entity_id));
    const teamNames = new Map((teams.data ?? []).map((row) => [row.id, row.name]));
    let reminded = 0;
    const errors: string[] = [];

    for (const fixture of candidates) {
      if (submittedIds.has(fixture.id) || remindedIds.has(fixture.id)) continue;
      const season = seasonById.get(fixture.season_id);
      if (!season) continue;
      const scorecard = framesByFixture.get(fixture.id) ?? [];
      const expected = expectedLeagueScorecardFrames(season.singles_count ?? 4, season.doubles_count ?? 1);
      if (scorecard.length !== expected.length || !validateCompleteLeagueScorecard(scorecard, season.singles_count ?? 4, season.doubles_count ?? 1).valid) continue;

      // Do not chase a recently completed card while the scorer may still be reviewing it.
      const finalSave = await client.from("audit_logs")
        .select("created_at,meta")
        .eq("action", "league_live_progress_saved")
        .eq("entity_type", "league_fixture")
        .eq("entity_id", fixture.id)
        .contains("meta", { completed_frames: expected.length })
        .order("created_at", { ascending: true })
        .limit(1);
      if (finalSave.error) {
        errors.push(`${fixture.id}: ${finalSave.error.message}`);
        continue;
      }
      const completedSave = finalSave.data?.[0];
      if (!completedSave || now.getTime() - new Date(completedSave.created_at).getTime() < MINIMUM_HOURS_AFTER_FINAL_SAVE * 60 * 60 * 1000) continue;

      // Recheck immediately before sending, in case the captain submitted during this run.
      const latestSubmission = await client.from("league_result_submissions").select("id")
        .eq("fixture_id", fixture.id).in("status", ["pending", "approved"]).limit(1);
      if (latestSubmission.error || (latestSubmission.data ?? []).length) {
        if (latestSubmission.error) errors.push(`${fixture.id}: ${latestSubmission.error.message}`);
        continue;
      }

      const homeOfficers = await client.from("league_team_members").select("player_id")
        .eq("season_id", fixture.season_id).eq("team_id", fixture.home_team_id)
        .or("is_captain.eq.true,is_vice_captain.eq.true");
      if (homeOfficers.error) {
        errors.push(`${fixture.id}: ${homeOfficers.error.message}`);
        continue;
      }
      const playerIds = [...new Set((homeOfficers.data ?? []).map((row) => row.player_id).filter(Boolean))];
      const users = playerIds.length
        ? await client.from("app_users").select("id").in("linked_player_id", playerIds)
        : { data: [], error: null };
      if (users.error) {
        errors.push(`${fixture.id}: ${users.error.message}`);
        continue;
      }

      const matchName = `${teamNames.get(fixture.home_team_id) ?? "Home team"} vs ${teamNames.get(fixture.away_team_id) ?? "Away team"}`;
      // Record the attempt first so a retried daily job cannot repeatedly notify people.
      const claim = await client.from("audit_logs").insert({
        actor_user_id: null,
        actor_email: "system@rack-and-frame.local",
        actor_role: "system",
        action: REMINDER_ACTION,
        entity_type: "league_fixture",
        entity_id: fixture.id,
        summary: `Completed scorecard for ${matchName} was saved but not submitted for approval.`,
        meta: { fixture_id: fixture.id, fixture_date: fixture.fixture_date, completed_save_at: completedSave.created_at },
      }).select("id").single();
      if (claim.error) {
        errors.push(`${fixture.id}: ${claim.error.message}`);
        continue;
      }

      const url = `/captain-results?fixtureId=${fixture.id}`;
      const delivery = await Promise.allSettled([
        sendPushToUserIds(client, (users.data ?? []).map((row) => row.id), {
          title: "Match scorecard still needs submitting",
          body: `${matchName}: all ${expected.length} frames are saved, but the result has not been submitted. Please review and submit it for approval.`,
          url,
          tag: `unsubmitted-scorecard-${fixture.id}`,
        }),
        sendPushToLeagueManagers(client, {
          title: "Completed scorecard not submitted",
          body: `${matchName}: all frames are saved, but no result has been submitted for approval. Please follow up with the home team; this has not been auto-approved.`,
          url: "/results",
          tag: `unsubmitted-scorecard-officer-${fixture.id}`,
        }, (users.data ?? []).map((row) => row.id)),
      ]);
      const [captainDelivery, officerDelivery] = delivery.map((result) => result.status === "fulfilled"
        ? result.value
        : { error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
      await client.from("audit_logs").update({
        meta: {
          fixture_id: fixture.id,
          fixture_date: fixture.fixture_date,
          completed_save_at: completedSave.created_at,
          captain_delivery: captainDelivery,
          officer_delivery: officerDelivery,
        },
      }).eq("id", claim.data.id);
      reminded += 1;
    }

    return NextResponse.json({ checked: candidates.length, reminded, errors }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reminder job failed." }, { status: 500, headers: noStore });
  }
}
