import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { expectedLeagueScorecardFrames, validateCompleteLeagueScorecard } from "@/lib/league-scorecard-validation";
import { requireLeagueManager } from "@/lib/server-role";
import { fetchAllSupabasePages, fetchAllSupabasePagesByChunks } from "@/lib/supabase-pagination";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" };

function todayInLondon() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function GET(request: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !serviceKey) throw new Error("SERVER_NOT_CONFIGURED");
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!token) throw new Error("UNAUTHORIZED");
    const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const user = await auth.auth.getUser(token);
    if (user.error || !user.data.user) throw new Error("UNAUTHORIZED");
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await requireLeagueManager(db, user.data.user);

    const seasons = await fetchAllSupabasePages((from, to) => db.from("league_seasons")
      .select("id,name,singles_count,doubles_count")
      .eq("is_active", true).eq("is_published", true)
      .order("id", { ascending: true }).range(from, to));
    if (seasons.error) throw new Error(seasons.error.message);
    const seasonById = new Map((seasons.data ?? []).map((season) => [season.id, season]));
    if (!seasonById.size) return NextResponse.json({ fixtures: [], asOf: new Date().toISOString() }, { headers: noStore });

    const fixtures = await fetchAllSupabasePages((from, to) => db.from("league_fixtures")
      .select("id,season_id,fixture_date,home_team_id,away_team_id,status,home_lineup_submitted_at,away_lineup_submitted_at")
      .in("season_id", [...seasonById.keys()])
      .in("status", ["pending", "in_progress"])
      .lte("fixture_date", todayInLondon())
      .order("fixture_date", { ascending: false }).order("id", { ascending: true })
      .range(from, to));
    if (fixtures.error) throw new Error(fixtures.error.message);
    const candidates = fixtures.data ?? [];
    if (!candidates.length) return NextResponse.json({ fixtures: [], asOf: new Date().toISOString() }, { headers: noStore });

    const ids = candidates.map((fixture) => fixture.id);
    const [frames, submissions, teams] = await Promise.all([
      fetchAllSupabasePagesByChunks(ids, (chunk, from, to) => db.from("league_fixture_frames")
        .select("fixture_id,slot_no,slot_type,winner_side,home_forfeit,away_forfeit,home_points_scored,away_points_scored")
        .in("fixture_id", chunk).order("id", { ascending: true }).range(from, to)),
      fetchAllSupabasePagesByChunks(ids, (chunk, from, to) => db.from("league_result_submissions")
        .select("fixture_id,status").in("fixture_id", chunk).in("status", ["pending", "approved"])
        .order("id", { ascending: true }).range(from, to)),
      fetchAllSupabasePagesByChunks([...new Set(candidates.flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id]))],
        (chunk, from, to) => db.from("league_teams").select("id,name")
          .in("id", chunk).order("id", { ascending: true }).range(from, to)),
    ]);
    for (const result of [frames, submissions, teams]) if (result.error) throw new Error(result.error.message);
    const submitted = new Set((submissions.data ?? []).map((submission) => submission.fixture_id));
    const teamById = new Map((teams.data ?? []).map((team) => [team.id, team.name]));
    const framesByFixture = new Map<string, NonNullable<typeof frames.data>>();
    for (const frame of frames.data ?? []) {
      const rows = framesByFixture.get(frame.fixture_id) ?? [];
      rows.push(frame);
      framesByFixture.set(frame.fixture_id, rows);
    }

    const outstanding = candidates.filter((fixture) => !submitted.has(fixture.id)).map((fixture) => {
      const season = seasonById.get(fixture.season_id)!;
      const singles = season.singles_count ?? 4;
      const doubles = season.doubles_count ?? 1;
      const expected = expectedLeagueScorecardFrames(singles, doubles);
      const scorecard = framesByFixture.get(fixture.id) ?? [];
      const completed = expected.filter(({ slot_no }) => scorecard.some((frame) => frame.slot_no === slot_no &&
        (frame.winner_side || frame.home_forfeit || frame.away_forfeit))).length;
      const validation = validateCompleteLeagueScorecard(scorecard, singles, doubles);
      const completeAndValid = scorecard.length === expected.length && validation.valid;
      const status = completeAndValid ? "ready_to_submit"
        : completed === expected.length ? "needs_scorecard_check"
        : !fixture.home_lineup_submitted_at || !fixture.away_lineup_submitted_at ? "awaiting_lineup"
        : "awaiting_scores";
      return {
        id: fixture.id, seasonId: fixture.season_id, season: season.name, date: fixture.fixture_date,
        home: teamById.get(fixture.home_team_id) ?? "Home team",
        away: teamById.get(fixture.away_team_id) ?? "Away team",
        status, completed, expected: expected.length,
        missingLineup: !fixture.home_lineup_submitted_at && !fixture.away_lineup_submitted_at ? "Both teams"
          : !fixture.home_lineup_submitted_at ? "Home team"
          : !fixture.away_lineup_submitted_at ? "Away team" : null,
        detail: status === "needs_scorecard_check" ? validation.error ?? "The saved frame count does not match this league's format." : null,
      };
    });

    const readyIds = outstanding.filter((fixture) => fixture.status === "ready_to_submit").map((fixture) => fixture.id);
    if (readyIds.length) {
      const audits = await fetchAllSupabasePagesByChunks(readyIds, (chunk, from, to) => db.from("audit_logs")
        .select("entity_id,action,created_at,actor_email")
        .eq("entity_type", "league_fixture")
        .in("entity_id", chunk)
        .in("action", ["league_live_progress_saved", "league_scorecard_submission_reminder_attempted"])
        .order("id", { ascending: true }).range(from, to));
      if (audits.error) throw new Error(audits.error.message);
      const lastSave = new Map<string, { at: string; by: string | null }>();
      const reminders = new Map<string, string>();
      for (const audit of audits.data ?? []) {
        if (audit.action === "league_live_progress_saved") lastSave.set(audit.entity_id, { at: audit.created_at, by: audit.actor_email });
        if (audit.action === "league_scorecard_submission_reminder_attempted") reminders.set(audit.entity_id, audit.created_at);
      }
      for (const fixture of outstanding) {
        if (fixture.status !== "ready_to_submit") continue;
        Object.assign(fixture, { lastSaved: lastSave.get(fixture.id) ?? null, reminderAttemptedAt: reminders.get(fixture.id) ?? null });
      }
    }

    return NextResponse.json({ fixtures: outstanding, asOf: new Date().toISOString() }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load outstanding scorecards.";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN_LEAGUE_MANAGER" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "League officer access is required." : status === 401 ? "Unauthorized." : message }, { status, headers: noStore });
  }
}
