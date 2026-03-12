import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type CompetitionRow = {
  id: string;
  name: string;
  match_mode: "singles" | "doubles";
  signup_open: boolean;
  signup_deadline: string | null;
  max_entries: number | null;
  is_archived: boolean;
  is_completed: boolean;
};

const isHodgeCompetitionName = (name: string) =>
  name === "Hodge Cup (Triples)" || name.startsWith("Hodge Cup (Triples) - ");
const isAlberyCompetitionName = (name: string) =>
  name === "Albery Cup (Billiards 3-Man Team)" || name.startsWith("Albery Cup (Billiards 3-Man Team) - ");
const requiredEntrants = (competition: CompetitionRow) => {
  if (isHodgeCompetitionName(competition.name) || isAlberyCompetitionName(competition.name)) return 3;
  if (competition.match_mode === "doubles") return 2;
  return 1;
};

function getMinimumAgeForCompetition(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("over 60")) return 60;
  if (lower.includes("over 50")) return 50;
  return null;
}

function calculateAgeYears(dobIso: string) {
  const dob = new Date(dobIso);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
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

  const body = await req.json().catch(() => ({}));
  const competitionId = String(body?.competitionId ?? "").trim();
  const entrantDateOfBirth = String(body?.entrantDateOfBirth ?? "").trim() || null;
  const teamMemberNames = Array.isArray(body?.teamMemberNames)
    ? body.teamMemberNames.map((v: unknown) => String(v ?? "").trim()).filter((v: string) => v.length > 0)
    : [];
  if (!competitionId) return NextResponse.json({ error: "Competition is required." }, { status: 400 });

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const appUserRes = await adminClient
    .from("app_users")
    .select("id,role,linked_player_id")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (appUserRes.error || !appUserRes.data) return NextResponse.json({ error: "User account record not found." }, { status: 400 });
  const appUser = appUserRes.data as { id: string; role: string | null; linked_player_id: string | null };
  const role = String(appUser.role ?? "").toLowerCase();
  if (role === "owner" || role === "super") {
    return NextResponse.json({ error: "Super User cannot enter competitions." }, { status: 403 });
  }
  if (!appUser.linked_player_id) {
    return NextResponse.json({ error: "Complete your player profile link before entering a competition." }, { status: 400 });
  }

  const [competitionRes, linkedPlayerRes] = await Promise.all([
    adminClient
      .from("competitions")
      .select("id,name,match_mode,signup_open,signup_deadline,max_entries,is_archived,is_completed")
      .eq("id", competitionId)
      .maybeSingle(),
    adminClient
      .from("players")
      .select("id,location_id,date_of_birth")
      .eq("id", appUser.linked_player_id)
      .maybeSingle(),
  ]);
  if (competitionRes.error || !competitionRes.data) return NextResponse.json({ error: "Competition not found." }, { status: 404 });
  if (linkedPlayerRes.error || !linkedPlayerRes.data) return NextResponse.json({ error: "Linked player profile not found." }, { status: 400 });

  const competition = competitionRes.data as CompetitionRow;
  const linkedPlayer = linkedPlayerRes.data as { id: string; location_id: string | null; date_of_birth: string | null };

  if (competition.is_archived || competition.is_completed || !competition.signup_open) {
    return NextResponse.json({ error: "Sign-ups are closed for this competition." }, { status: 400 });
  }
  if (competition.signup_deadline && Date.parse(competition.signup_deadline) < Date.now()) {
    return NextResponse.json({ error: "Sign-up deadline has passed for this competition." }, { status: 400 });
  }
  if (competition.max_entries) {
    const approvedRes = await adminClient
      .from("competition_entries")
      .select("id", { count: "exact", head: true })
      .eq("competition_id", competitionId)
      .eq("status", "approved");
    if (approvedRes.error) return NextResponse.json({ error: approvedRes.error.message }, { status: 400 });
    if ((approvedRes.count ?? 0) >= competition.max_entries) {
      return NextResponse.json({ error: "This competition is full." }, { status: 400 });
    }
  }

  const minAge = getMinimumAgeForCompetition(competition.name);
  const dob = entrantDateOfBirth ?? linkedPlayer.date_of_birth ?? null;
  if (minAge !== null) {
    if (!dob) {
      return NextResponse.json(
        { error: `Date of birth is required to enter ${competition.name}.` },
        { status: 400 }
      );
    }
    const age = calculateAgeYears(dob);
    if (age === null) return NextResponse.json({ error: "Enter a valid date of birth." }, { status: 400 });
    if (age < minAge) return NextResponse.json({ error: `You are not eligible for ${competition.name}. Minimum age is ${minAge}.` }, { status: 400 });
  }

  const entrantsNeeded = requiredEntrants(competition);
  if (teamMemberNames.length !== Math.max(0, entrantsNeeded - 1)) {
    return NextResponse.json(
      {
        error:
          entrantsNeeded === 1
            ? "This competition is singles and does not require extra names."
            : entrantsNeeded === 2
              ? "Enter exactly one teammate name."
              : "Enter exactly two teammate names.",
      },
      { status: 400 }
    );
  }

  const normalized = teamMemberNames.map((n: string) => n.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    return NextResponse.json({ error: "Duplicate teammate names are not allowed." }, { status: 400 });
  }

  const existingPlayerNamesRes = await adminClient
    .from("players")
    .select("id,display_name,full_name,location_id,is_archived")
    .eq("is_archived", false)
    .eq("location_id", linkedPlayer.location_id);
  if (existingPlayerNamesRes.error) return NextResponse.json({ error: existingPlayerNamesRes.error.message }, { status: 400 });
  const clubPlayers = (existingPlayerNamesRes.data ?? []) as Array<{
    id: string;
    display_name: string;
    full_name: string | null;
    location_id: string | null;
    is_archived: boolean;
  }>;

  const byName = new Map<string, { id: string; label: string }>();
  for (const p of clubPlayers) {
    const full = (p.full_name ?? "").trim();
    if (full) byName.set(full.toLowerCase(), { id: p.id, label: full });
    byName.set(p.display_name.toLowerCase(), { id: p.id, label: p.display_name });
  }

  const resolvedMemberIds: string[] = [];
  const missingNames: string[] = [];
  for (const raw of teamMemberNames) {
    const key = raw.toLowerCase();
    const hit = byName.get(key);
    if (!hit) {
      missingNames.push(raw);
      continue;
    }
    if (hit.id === linkedPlayer.id) {
      return NextResponse.json({ error: "Do not repeat your own name in teammate slots." }, { status: 400 });
    }
    resolvedMemberIds.push(hit.id);
  }
  if (missingNames.length > 0) {
    return NextResponse.json(
      {
        error:
          `The following names are not in your club player directory: ${missingNames.join(", ")}. ` +
          "Please contact the club secretary/chairman to add them before entering this competition.",
      },
      { status: 400 }
    );
  }

  const existingEntryRes = await adminClient
    .from("competition_entries")
    .select("id,status")
    .eq("competition_id", competitionId)
    .eq("requester_user_id", authData.user.id)
    .maybeSingle();
  if (existingEntryRes.error) return NextResponse.json({ error: existingEntryRes.error.message }, { status: 400 });

  const notePayload =
    entrantsNeeded > 1
      ? JSON.stringify({
          teamMemberNames,
          teamMemberIds: resolvedMemberIds,
          locationId: linkedPlayer.location_id ?? null,
        })
      : null;

  if (existingEntryRes.data && (existingEntryRes.data.status === "pending" || existingEntryRes.data.status === "approved")) {
    return NextResponse.json({ error: "You already have an active sign-up for this competition." }, { status: 400 });
  }
  if (existingEntryRes.data) {
    const upd = await adminClient
      .from("competition_entries")
      .update({
        status: "pending",
        player_id: linkedPlayer.id,
        entrant_date_of_birth: dob,
        note: notePayload,
        reviewed_at: null,
        reviewed_by_user_id: null,
      })
      .eq("id", existingEntryRes.data.id);
    if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 400 });
  } else {
    const ins = await adminClient.from("competition_entries").insert({
      competition_id: competitionId,
      requester_user_id: authData.user.id,
      player_id: linkedPlayer.id,
      entrant_date_of_birth: dob,
      note: notePayload,
      status: "pending",
    });
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
