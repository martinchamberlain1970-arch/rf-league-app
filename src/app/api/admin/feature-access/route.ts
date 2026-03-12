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
  if (authError || !authData.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const requesterEmail = authData.user.email?.trim().toLowerCase() ?? "";
  if (!superAdminEmail || requesterEmail !== superAdminEmail) {
    return NextResponse.json({ error: "Only Super User can set feature access." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const userId = String(body?.userId ?? "").trim();
  const feature = String(body?.feature ?? "").trim();
  const enabled = Boolean(body?.enabled);
  if (!userId || (feature !== "quick_match" && feature !== "competition_create")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const column = feature === "quick_match" ? "quick_match_enabled" : "competition_create_enabled";
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const update = await adminClient.from("app_users").update({ [column]: enabled }).eq("id", userId);
  if (update.error) return NextResponse.json({ error: update.error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

