import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();

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
  const phoneNumber = body?.phoneNumber === null ? null : String(body?.phoneNumber ?? "").trim() || null;
  const phoneShareConsent = Boolean(body?.phoneShareConsent);
  if (!playerId) return NextResponse.json({ error: "playerId is required." }, { status: 400 });

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
      return NextResponse.json({ error: "You can only update your own contact details." }, { status: 403 });
    }
  }

  const update = await adminClient
    .from("players")
    .update({
      phone_number: phoneNumber,
      phone_share_consent: phoneShareConsent,
    })
    .eq("id", playerId);
  if (update.error) {
    return NextResponse.json({ error: update.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

