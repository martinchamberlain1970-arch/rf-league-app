import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();

function calculateAgeBand(dob: string): "under_13" | "13_15" | "16_17" | "18_plus" {
  const birth = new Date(`${dob}T12:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  if (age < 13) return "under_13";
  if (age < 16) return "13_15";
  if (age < 18) return "16_17";
  return "18_plus";
}

export async function POST(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Missing auth token." }, { status: 401 });

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const playerId = String(body?.playerId ?? "").trim();
  const dateOfBirth = String(body?.dateOfBirth ?? "").trim();
  if (!playerId) return NextResponse.json({ error: "playerId is required." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    return NextResponse.json({ error: "A valid date of birth is required." }, { status: 400 });
  }

  const requesterId = authData.user.id;
  const requesterEmail = authData.user.email?.trim().toLowerCase() ?? "";
  const isSuper = Boolean(superAdminEmail) && requesterEmail === superAdminEmail;

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  if (!isSuper) {
    const appUserRes = await adminClient
      .from("app_users")
      .select("linked_player_id")
      .eq("id", requesterId)
      .maybeSingle();
    const linkedPlayerId = (appUserRes.data as { linked_player_id?: string | null } | null)?.linked_player_id ?? null;
    if (linkedPlayerId !== playerId) {
      return NextResponse.json({ error: "You can only update your own date of birth." }, { status: 403 });
    }
  }

  const ageBand = calculateAgeBand(dateOfBirth);
  const payload: Record<string, string | null> = {
    date_of_birth: dateOfBirth,
    age_band: ageBand,
  };
  if (ageBand !== "18_plus") payload.avatar_url = null;

  const updateRes = await adminClient
    .from("players")
    .update(payload)
    .eq("id", playerId)
    .select("id,date_of_birth,age_band,avatar_url")
    .maybeSingle();

  if (updateRes.error) {
    return NextResponse.json({ error: updateRes.error.message }, { status: 400 });
  }
  if (!updateRes.data) {
    return NextResponse.json({ error: "No player record was updated." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    player: updateRes.data,
  });
}
