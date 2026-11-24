import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { hasScorecardOpponents, privateScorecardHeaders, scorecardMatchFields, scorecardPlayerIds } from "@/lib/competition-scorecard-links";

const reply = (body: object, status = 200) => NextResponse.json(body, { headers: privateScorecardHeaders, status });

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return reply({ error: "Competition scorecards are unavailable." }, 503);

  const competitionId = request.nextUrl.searchParams.get("competitionId");
  if (competitionId && !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(competitionId)) {
    return reply({ error: "Select a valid competition." }, 400);
  }
  const client = createClient(url, key);
  try {
    const competitions = client.from("competitions").select("id,name")
      .eq("competition_format", "knockout").eq("is_archived", false).eq("is_completed", false);
    if (!competitionId) {
      const { data, error } = await competitions.order("name");
      if (error) throw error;
      return reply({ competitions: data });
    }
    const selected = await competitions.eq("id", competitionId).maybeSingle();
    if (selected.error) throw selected.error;
    if (!selected.data) return reply({ error: "This competition is unavailable." }, 404);

    const matches = await client.from("matches").select(scorecardMatchFields)
      .eq("competition_id", competitionId).eq("is_archived", false).in("status", ["pending", "in_progress"])
      .order("round_no").order("match_no");
    if (matches.error) throw matches.error;
    const ready = matches.data.filter(hasScorecardOpponents);
    const ids = [...new Set(ready.flatMap(scorecardPlayerIds))];
    if (!ids.length) return reply({ fixtures: [] });

    const players = await client.from("players").select("id,display_name,full_name").in("id", ids);
    if (players.error) throw players.error;
    const names = new Map(players.data.map((player) => [player.id, player.full_name?.trim() || player.display_name]));
    const label = (side: Array<string | null>) => side.flatMap((id) => id && names.get(id) ? [names.get(id)] : []).join(" & ");
    return reply({
      fixtures: ready.map((match) => ({
        id: match.id,
        name: `Round ${match.round_no ?? 1} · ${label(match.team1_player1_id ? [match.team1_player1_id, match.team1_player2_id] : [match.player1_id])} vs ${label(match.team2_player1_id ? [match.team2_player1_id, match.team2_player2_id] : [match.player2_id])}`,
      })),
    });
  } catch {
    return reply({ error: "The competition fixtures could not be loaded. Try again." }, 500);
  }
}
