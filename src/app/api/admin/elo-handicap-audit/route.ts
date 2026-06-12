import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { targetHandicapFromElo } from "@/lib/snooker-rating";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail =
  process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ??
  process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL?.trim().toLowerCase() ??
  "";

type PlayerRow = {
  id: string;
  full_name: string | null;
  display_name: string;
  rating_snooker: number | null;
  snooker_handicap: number | null;
  snooker_handicap_base: number | null;
  rated_matches_snooker: number | null;
  is_archived?: boolean | null;
};

type RatingEventRow = {
  player_id: string | null;
  rating_after: number | null;
  created_at: string;
};

export async function GET(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Missing auth token." }, { status: 401 });

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const authRes = await authClient.auth.getUser(token);
  const user = authRes.data.user;
  if (authRes.error || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const email = user.email?.trim().toLowerCase() ?? "";
  if (!superAdminEmail || email !== superAdminEmail) {
    return NextResponse.json({ error: "Only Super User can access the Elo audit." }, { status: 403 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const memberRes = await adminClient.from("league_registered_team_members").select("player_id");
  if (memberRes.error) {
    return NextResponse.json({ error: memberRes.error.message }, { status: 400 });
  }

  const playerIds = Array.from(
    new Set((memberRes.data ?? []).map((row) => row.player_id).filter((value): value is string => Boolean(value)))
  );
  if (playerIds.length === 0) {
    return NextResponse.json({
      generated_at: new Date().toISOString(),
      summary: {
        total_players: 0,
        players_with_any_flags: 0,
        handicap_aligned: 0,
        handicap_misaligned: 0,
        rating_aligned: 0,
        rating_misaligned: 0,
        rated_match_count_aligned: 0,
        rated_match_count_misaligned: 0,
      },
      rows: [],
    });
  }

  const [playersRes, eventsRes] = await Promise.all([
    adminClient
      .from("players")
      .select("id,full_name,display_name,rating_snooker,snooker_handicap,snooker_handicap_base,rated_matches_snooker,is_archived")
      .in("id", playerIds)
      .eq("is_archived", false),
    adminClient
      .from("rating_events")
      .select("player_id,rating_after,created_at")
      .in("player_id", playerIds)
      .order("created_at", { ascending: false }),
  ]);

  const firstError = playersRes.error?.message || eventsRes.error?.message;
  if (firstError) {
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const players = (playersRes.data ?? []) as PlayerRow[];
  const events = (eventsRes.data ?? []) as RatingEventRow[];

  const eventCountByPlayer = new Map<string, number>();
  const latestEventByPlayer = new Map<string, RatingEventRow>();

  for (const event of events) {
    const playerId = event.player_id ?? "";
    if (!playerId) continue;
    eventCountByPlayer.set(playerId, (eventCountByPlayer.get(playerId) ?? 0) + 1);
    if (!latestEventByPlayer.has(playerId)) latestEventByPlayer.set(playerId, event);
  }

  const rows = players
    .map((player) => {
      const name = player.full_name?.trim() || player.display_name || "Unknown player";
      const currentRating = Math.round(Number(player.rating_snooker ?? 1000));
      const currentHandicap = Number(player.snooker_handicap ?? 0);
      const baselineHandicap = Number(player.snooker_handicap_base ?? player.snooker_handicap ?? 0);
      const targetHandicap = targetHandicapFromElo(Number(player.rating_snooker ?? 1000));
      const handicapGap = targetHandicap - currentHandicap;
      const reviewStepsAway = Math.abs(handicapGap) / 4;
      const ratedMatchesStored = Number(player.rated_matches_snooker ?? 0);
      const ratingEventCount = eventCountByPlayer.get(player.id) ?? 0;
      const latestEvent = latestEventByPlayer.get(player.id) ?? null;
      const latestEventRating = latestEvent?.rating_after !== null && typeof latestEvent?.rating_after !== "undefined"
        ? Math.round(Number(latestEvent.rating_after))
        : null;
      const ratingGap = latestEventRating === null ? 0 : currentRating - latestEventRating;
      const flags: string[] = [];
      if (handicapGap !== 0) flags.push("handicap_not_aligned_to_elo");
      if (latestEventRating !== null && ratingGap !== 0) flags.push("current_elo_differs_from_latest_rating_event");
      if (ratedMatchesStored !== ratingEventCount) flags.push("rated_match_count_differs_from_rating_events");
      if (ratedMatchesStored === 0 && (currentRating !== 1000 || currentHandicap !== 0 || targetHandicap !== 0)) {
        flags.push("unrated_player_has_non_default_values");
      }

      return {
        player_id: player.id,
        player_name: name,
        current_rating: currentRating,
        latest_event_rating: latestEventRating,
        rating_gap: ratingGap,
        current_handicap: currentHandicap,
        target_handicap: targetHandicap,
        handicap_gap: handicapGap,
        review_steps_away: reviewStepsAway,
        baseline_handicap: baselineHandicap,
        rated_matches_stored: ratedMatchesStored,
        rating_event_count: ratingEventCount,
        latest_event_at: latestEvent?.created_at ?? null,
        flags,
      };
    })
    .sort(
      (a, b) =>
        b.flags.length - a.flags.length ||
        Math.abs(b.handicap_gap) - Math.abs(a.handicap_gap) ||
        Math.abs(b.rating_gap) - Math.abs(a.rating_gap) ||
        b.current_rating - a.current_rating ||
        a.player_name.localeCompare(b.player_name)
    );

  const summary = {
    total_players: rows.length,
    players_with_any_flags: rows.filter((row) => row.flags.length > 0).length,
    handicap_aligned: rows.filter((row) => row.handicap_gap === 0).length,
    handicap_misaligned: rows.filter((row) => row.handicap_gap !== 0).length,
    rating_aligned: rows.filter((row) => row.latest_event_rating === null || row.rating_gap === 0).length,
    rating_misaligned: rows.filter((row) => row.latest_event_rating !== null && row.rating_gap !== 0).length,
    rated_match_count_aligned: rows.filter((row) => row.rated_matches_stored === row.rating_event_count).length,
    rated_match_count_misaligned: rows.filter((row) => row.rated_matches_stored !== row.rating_event_count).length,
  };

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    summary,
    rows,
  });
}
