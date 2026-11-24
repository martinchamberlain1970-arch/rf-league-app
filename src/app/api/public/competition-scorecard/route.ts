import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { findScorecardLink, hasScorecardOpponents, privateScorecardHeaders, scorecardMatchFields, scorecardPlayerIds, scorecardTokenHash } from "@/lib/competition-scorecard-links";
import { fixedHandicapsForMatch } from "@/lib/fixed-competition-handicaps-server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: privateScorecardHeaders });
const unavailable = () => reply({ error: "This scorecard link has expired, been used or been replaced. Contact a league officer for a new link." }, 410);

export async function GET(request: NextRequest) {
  const hash = scorecardTokenHash(request.headers.get("authorization")?.match(/^Scorecard ([A-Za-z0-9_-]+)$/)?.[1] ?? "");
  if (!hash) return unavailable();
  if (!url || !serviceKey) return reply({ error: "Scorecards are temporarily unavailable." }, 503);

  try {
    const client = createClient(url, serviceKey);
    const matchId = await findScorecardLink(client, hash);
    const requested = request.nextUrl.searchParams.get("matchId");
    if (!matchId || (requested && requested !== matchId)) return unavailable();
    const { data: match, error } = await client.from("matches").select(scorecardMatchFields).eq("id", matchId).eq("is_archived", false).maybeSingle();
    if (error) throw error;
    if (!match?.competition_id || !["pending", "in_progress"].includes(match.status) || !hasScorecardOpponents(match)) return unavailable();

    const [competition, players, pending] = await Promise.all([
      client.from("competitions").select("id,name,sport_type").eq("id", match.competition_id)
        .eq("competition_format", "knockout").eq("is_archived", false).eq("is_completed", false).maybeSingle(),
      client.from("players").select("id,display_name,full_name").in("id", scorecardPlayerIds(match)),
      client.from("competition_result_submissions").select("id").eq("match_id", match.id).eq("status", "pending").limit(1),
    ]);
    if (competition.error || players.error || pending.error) throw competition.error ?? players.error ?? pending.error;
    if (!competition.data) return unavailable();
    if (pending.data?.length) return reply({ error: "A result has already been submitted for this match and is awaiting approval." }, 409);

    const handicap = await fixedHandicapsForMatch(client, { ...match, competition_id: match.competition_id }, competition.data.name);
    return reply({ match, competition: competition.data, players: players.data, handicap });
  } catch {
    return reply({ error: "The scorecard could not be loaded. Try again." }, 500);
  }
}
