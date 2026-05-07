import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type FramePatch = {
  id: string;
  home_player1_id?: string | null;
  home_player2_id?: string | null;
  home_nominated?: boolean;
  home_forfeit?: boolean;
  home_nominated_name?: string | null;
  away_player1_id?: string | null;
  away_player2_id?: string | null;
  away_nominated?: boolean;
  away_forfeit?: boolean;
  away_nominated_name?: string | null;
};

type FixtureFrameRow = {
  id: string;
  slot_type: "singles" | "doubles";
};

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
  const side = body?.side as "home" | "away" | undefined;
  const sideFields = (body?.sideFields ?? []) as FramePatch[];

  if (!fixtureId || (side !== "home" && side !== "away") || !Array.isArray(sideFields) || sideFields.length === 0) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const appUserRes = await adminClient.from("app_users").select("linked_player_id").eq("id", userId).maybeSingle();
  const linkedPlayerId = (appUserRes.data?.linked_player_id as string | null) ?? null;
  if (!linkedPlayerId) {
    return NextResponse.json({ error: "Your account is not linked to a player profile." }, { status: 400 });
  }

  const fixtureRes = await adminClient
    .from("league_fixtures")
    .select("id,season_id,fixture_date,status,pre_match_paper_record,home_team_id,away_team_id,home_lineup_submitted_at,away_lineup_submitted_at")
    .eq("id", fixtureId)
    .maybeSingle();

  if (fixtureRes.error || !fixtureRes.data) {
    return NextResponse.json({ error: "Fixture not found." }, { status: 404 });
  }

  const fixture = fixtureRes.data as {
    id: string;
    season_id: string;
    fixture_date: string | null;
    status: string;
    pre_match_paper_record?: boolean | null;
    home_team_id: string;
    away_team_id: string;
    home_lineup_submitted_at?: string | null;
    away_lineup_submitted_at?: string | null;
  };

  if (fixture.status === "complete") {
    return NextResponse.json({ error: "This fixture is already complete." }, { status: 400 });
  }
  if (fixture.pre_match_paper_record) {
    return NextResponse.json({ error: "This fixture is using a paper pre-match record." }, { status: 400 });
  }
  if (!fixture.fixture_date) {
    return NextResponse.json({ error: "Fixture has no date." }, { status: 400 });
  }

  const start = new Date(`${fixture.fixture_date}T00:00:00`);
  const hardStop = new Date(start);
  hardStop.setDate(hardStop.getDate() + 1);
  hardStop.setHours(1, 0, 0, 0);
  const now = new Date();
  if (now < start || now > hardStop) {
    return NextResponse.json({ error: "Lineup submission is closed for this fixture." }, { status: 400 });
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
  const allowedTeam = roleRows.find((row) => row.is_captain || Boolean(row.is_vice_captain));
  if (!allowedTeam) {
    return NextResponse.json({ error: "Only captain or vice-captain for this fixture can submit a lineup." }, { status: 403 });
  }

  if (side === "home") {
    if (allowedTeam.team_id !== fixture.home_team_id) {
      return NextResponse.json({ error: "Only the home captain or vice-captain can submit the home lineup." }, { status: 403 });
    }
    if (fixture.home_lineup_submitted_at || fixture.away_lineup_submitted_at) {
      return NextResponse.json({ error: "The home lineup has already been submitted for this fixture." }, { status: 400 });
    }
  }

  if (side === "away") {
    if (allowedTeam.team_id !== fixture.away_team_id) {
      return NextResponse.json({ error: "Only the away captain or vice-captain can submit the away lineup." }, { status: 403 });
    }
    if (!fixture.home_lineup_submitted_at) {
      return NextResponse.json({ error: "The home lineup must be submitted first." }, { status: 400 });
    }
    if (fixture.away_lineup_submitted_at) {
      return NextResponse.json({ error: "The away lineup has already been submitted for this fixture." }, { status: 400 });
    }
  }

  const allowedKeys = side === "home"
    ? ["home_player1_id", "home_player2_id", "home_nominated", "home_forfeit", "home_nominated_name"] as const
    : ["away_player1_id", "away_player2_id", "away_nominated", "away_forfeit", "away_nominated_name"] as const;

  const frameRes = await adminClient
    .from("league_fixture_frames")
    .select("id,slot_type")
    .eq("fixture_id", fixture.id);

  if (frameRes.error) {
    return NextResponse.json({ error: frameRes.error.message }, { status: 400 });
  }

  const frameById = new Map(((frameRes.data ?? []) as FixtureFrameRow[]).map((frame) => [frame.id, frame]));

  for (const patch of sideFields) {
    if (!patch?.id) {
      return NextResponse.json({ error: "Every frame update must include an id." }, { status: 400 });
    }

    const frame = frameById.get(patch.id);
    if (!frame) {
      return NextResponse.json({ error: `Frame ${patch.id} does not belong to this fixture.` }, { status: 400 });
    }

    if (side === "home") {
      const hasSinglesSelection = Boolean(patch.home_player1_id) || Boolean(patch.home_nominated) || Boolean(patch.home_forfeit);
      const hasDoublesSelection = Boolean(patch.home_player1_id) && Boolean(patch.home_player2_id);
      const nominatedNameValid = !patch.home_nominated || Boolean(patch.home_nominated_name?.trim());

      const lineupComplete = frame.slot_type === "doubles" ? hasDoublesSelection : hasSinglesSelection;
      if (!lineupComplete || !nominatedNameValid) {
        return NextResponse.json(
          { error: "Complete every home frame selection before submitting the lineup." },
          { status: 400 }
        );
      }
    } else {
      const hasSinglesSelection = Boolean(patch.away_player1_id) || Boolean(patch.away_nominated) || Boolean(patch.away_forfeit);
      const hasDoublesSelection = Boolean(patch.away_player1_id) && Boolean(patch.away_player2_id);
      const nominatedNameValid = !patch.away_nominated || Boolean(patch.away_nominated_name?.trim());

      const lineupComplete = frame.slot_type === "doubles" ? hasDoublesSelection : hasSinglesSelection;
      if (!lineupComplete || !nominatedNameValid) {
        return NextResponse.json(
          { error: "Complete every away frame selection before submitting the lineup." },
          { status: 400 }
        );
      }
    }
  }

  for (const patch of sideFields) {
    const updatePatch: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (key in patch) updatePatch[key] = patch[key];
    }
    const frameUpdate = await adminClient.from("league_fixture_frames").update(updatePatch).eq("id", patch.id).eq("fixture_id", fixture.id).select("id").maybeSingle();
    if (frameUpdate.error) {
      return NextResponse.json({ error: frameUpdate.error.message }, { status: 400 });
    }
    if (!frameUpdate.data?.id) {
      return NextResponse.json({ error: `Could not update frame ${patch.id}.` }, { status: 400 });
    }
  }

  const nowIso = new Date().toISOString();
  const fixturePatch = side === "home"
    ? { home_lineup_submitted_at: nowIso, home_lineup_submitted_by_user_id: userId }
    : { away_lineup_submitted_at: nowIso, away_lineup_submitted_by_user_id: userId };

  const fixtureUpdate = await adminClient
    .from("league_fixtures")
    .update(fixturePatch)
    .eq("id", fixture.id)
    .select("id,home_lineup_submitted_at,away_lineup_submitted_at")
    .maybeSingle();

  if (fixtureUpdate.error) {
    return NextResponse.json({ error: fixtureUpdate.error.message }, { status: 400 });
  }
  if (!fixtureUpdate.data?.id) {
    return NextResponse.json({ error: "The lineup was not saved to the fixture record." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, fixture: fixtureUpdate.data });
}
