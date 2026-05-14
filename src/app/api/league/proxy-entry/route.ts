import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type FixtureRow = {
  id: string;
  season_id: string;
  status: string;
  fixture_date: string | null;
  home_team_id: string;
  away_team_id: string;
  pre_match_paper_record?: boolean | null;
  proxy_entry_enabled?: boolean | null;
  home_lineup_submitted_at?: string | null;
  away_lineup_submitted_at?: string | null;
};

function isMatchWindowOpen(fixtureDate: string | null) {
  if (!fixtureDate) return false;
  const fixtureStart = new Date(`${fixtureDate}T00:00:00`);
  if (Number.isNaN(fixtureStart.getTime())) return false;
  const submissionDeadline = new Date(fixtureStart);
  submissionDeadline.setDate(submissionDeadline.getDate() + 1);
  submissionDeadline.setHours(23, 59, 59, 999);
  const now = new Date();
  return now >= fixtureStart && now <= submissionDeadline;
}

export async function POST(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Missing auth token." }, { status: 401 });

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const userId = authData.user.id;
  const body = await req.json().catch(() => null);
  const fixtureId = body?.fixtureId as string | undefined;
  if (!fixtureId) {
    return NextResponse.json({ error: "Fixture id is required." }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const appUserRes = await adminClient
    .from("app_users")
    .select("linked_player_id")
    .eq("id", userId)
    .maybeSingle();
  const linkedPlayerId = (appUserRes.data?.linked_player_id as string | null) ?? null;
  if (!linkedPlayerId) {
    return NextResponse.json({ error: "Your account is not linked to a player profile." }, { status: 400 });
  }

  let fixtureRes = await adminClient
    .from("league_fixtures")
    .select("id,season_id,status,fixture_date,home_team_id,away_team_id,pre_match_paper_record,proxy_entry_enabled,home_lineup_submitted_at,away_lineup_submitted_at")
    .eq("id", fixtureId)
    .maybeSingle();

  if (fixtureRes.error && fixtureRes.error.message.toLowerCase().includes("proxy_entry")) {
    fixtureRes = await adminClient
      .from("league_fixtures")
      .select("id,season_id,status,fixture_date,home_team_id,away_team_id,pre_match_paper_record,home_lineup_submitted_at,away_lineup_submitted_at")
      .eq("id", fixtureId)
      .maybeSingle();
  }

  if (fixtureRes.error || !fixtureRes.data) {
    return NextResponse.json({ error: "Fixture not found." }, { status: 404 });
  }

  const fixture = fixtureRes.data as FixtureRow;
  if (fixture.status === "complete") {
    return NextResponse.json({ error: "This fixture is already complete." }, { status: 400 });
  }
  if (fixture.pre_match_paper_record) {
    return NextResponse.json({ error: "Proxy entry is not available for paper pre-match records." }, { status: 400 });
  }
  if (!isMatchWindowOpen(fixture.fixture_date)) {
    return NextResponse.json({ error: "Proxy entry is only available during the fixture entry window." }, { status: 400 });
  }
  if (fixture.proxy_entry_enabled) {
    return NextResponse.json({ ok: true, alreadyEnabled: true });
  }

  const memberRes = await adminClient
    .from("league_team_members")
    .select("team_id,is_captain,is_vice_captain")
    .eq("season_id", fixture.season_id)
    .eq("player_id", linkedPlayerId)
    .or(`team_id.eq.${fixture.home_team_id},team_id.eq.${fixture.away_team_id}`);

  if (memberRes.error) {
    return NextResponse.json({ error: memberRes.error.message }, { status: 400 });
  }

  const roleRows = (memberRes.data ?? []) as Array<{ team_id: string; is_captain: boolean; is_vice_captain: boolean | null }>;
  const actingRole = roleRows.find((row) => row.is_captain || Boolean(row.is_vice_captain));
  if (!actingRole) {
    return NextResponse.json({ error: "Only a captain or vice-captain for this fixture can enable proxy entry." }, { status: 403 });
  }

  const actingSide = actingRole.team_id === fixture.home_team_id ? "home" : actingRole.team_id === fixture.away_team_id ? "away" : null;
  if (!actingSide) {
    return NextResponse.json({ error: "Only fixture teams can enable proxy entry." }, { status: 403 });
  }

  const nowIso = new Date().toISOString();
  const updateRes = await adminClient
    .from("league_fixtures")
    .update({
      proxy_entry_enabled: true,
      proxy_entry_confirmed_at: nowIso,
      proxy_entry_confirmed_by_user_id: userId,
      proxy_entry_by_team_side: actingSide,
      proxy_entry_note: "Agreed proxy entry enabled for this fixture.",
    })
    .eq("id", fixture.id);

  if (updateRes.error) {
    return NextResponse.json({ error: updateRes.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, actingSide });
}
