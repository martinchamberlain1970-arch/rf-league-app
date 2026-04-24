import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();

const MAX_AVATAR_FILE_BYTES = 10 * 1024 * 1024;

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

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid upload form." }, { status: 400 });

  const playerId = String(formData.get("playerId") ?? "").trim();
  const rawFile = formData.get("file");
  if (!playerId) return NextResponse.json({ error: "playerId is required." }, { status: 400 });
  if (!(rawFile instanceof File)) {
    return NextResponse.json({ error: "Choose an image file to upload." }, { status: 400 });
  }
  if (!rawFile.type.startsWith("image/")) {
    return NextResponse.json({ error: "Please choose an image file for the profile photo." }, { status: 400 });
  }
  if (rawFile.size > MAX_AVATAR_FILE_BYTES) {
    return NextResponse.json({ error: "Profile photos must be 10MB or smaller." }, { status: 400 });
  }

  const requesterId = authData.user.id;
  const requesterEmail = authData.user.email?.trim().toLowerCase() ?? "";
  const isSuper = Boolean(superAdminEmail) && requesterEmail === superAdminEmail;

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const appUserRes = await adminClient
    .from("app_users")
    .select("id,role,linked_player_id")
    .eq("id", requesterId)
    .maybeSingle();
  if (appUserRes.error || !appUserRes.data) {
    return NextResponse.json({ error: "User account record not found." }, { status: 400 });
  }

  const appUser = appUserRes.data as { id: string; role: string | null; linked_player_id: string | null };
  const role = String(appUser.role ?? "").toLowerCase();
  const hasAdminPower = isSuper || role === "owner" || role === "super" || role === "admin";
  if (!hasAdminPower && appUser.linked_player_id !== playerId) {
    return NextResponse.json({ error: "You can only update your own player profile photo." }, { status: 403 });
  }

  const playerRes = await adminClient
    .from("players")
    .select("id,date_of_birth")
    .eq("id", playerId)
    .maybeSingle();
  if (playerRes.error || !playerRes.data) {
    return NextResponse.json({ error: "Player profile not found." }, { status: 404 });
  }

  const ext = rawFile.name.split(".").pop() || "jpg";
  const path = `avatars/${playerId}-${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await rawFile.arrayBuffer());
  const uploadRes = await adminClient.storage.from("avatars").upload(path, bytes, {
    contentType: rawFile.type || undefined,
  });
  if (uploadRes.error) {
    return NextResponse.json({ error: uploadRes.error.message }, { status: 400 });
  }

  const publicUrl = adminClient.storage.from("avatars").getPublicUrl(path).data.publicUrl;

  if (!hasAdminPower) {
    const requestRes = await adminClient.from("player_update_requests").insert({
      player_id: playerId,
      requester_user_id: requesterId,
      requested_full_name: null,
      requested_location_id: null,
      requested_avatar_url: publicUrl,
      status: "pending",
    });
    if (requestRes.error) {
      return NextResponse.json({ error: requestRes.error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, mode: "pending", publicUrl });
  }

  const updateRes = await adminClient.from("players").update({ avatar_url: publicUrl }).eq("id", playerId);
  if (updateRes.error) {
    return NextResponse.json({ error: updateRes.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, mode: "direct", publicUrl });
}
