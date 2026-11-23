import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fixedHandicapsForMatch } from "@/lib/fixed-competition-handicaps-server";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers });
  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: "Please sign in." }, { status: 401, headers });
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const auth = await userClient.auth.getUser(token);
  if (auth.error || !auth.data.user) return NextResponse.json({ error: "Please sign in again." }, { status: 401, headers });

  const matchId = req.nextUrl.searchParams.get("matchId") ?? "";
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(matchId)) {
    return NextResponse.json({ error: "Invalid match." }, { status: 400, headers });
  }
  const match = await userClient.from("matches")
    .select("competition_id,player1_id,player2_id,team1_player1_id,team1_player2_id,team2_player1_id,team2_player2_id")
    .eq("id", matchId).eq("is_archived", false).maybeSingle();
  if (!match.data?.competition_id || match.error) return NextResponse.json({ error: "Match not found." }, { status: 404, headers });
  const competition = await userClient.from("competitions").select("name").eq("id", match.data.competition_id).maybeSingle();
  if (!competition.data || competition.error) return NextResponse.json({ error: "Competition not found." }, { status: 404, headers });

  try {
    const handicap = await fixedHandicapsForMatch(createClient(url, serviceKey), match.data, competition.data.name);
    return NextResponse.json({ handicap }, { headers });
  } catch (error) {
    console.error("Competition handicap lookup failed", error);
    return NextResponse.json({ error: "The fixed handicaps could not be loaded. Please try again." }, { status: 500, headers });
  }
}
