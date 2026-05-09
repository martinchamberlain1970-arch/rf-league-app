import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail =
  process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ??
  process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL?.trim().toLowerCase() ??
  "";

function isMissingTableError(message?: string | null) {
  const lower = (message ?? "").toLowerCase();
  return lower.includes("does not exist") || lower.includes("could not find the table");
}

async function authenticate(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return { error: NextResponse.json({ error: "Server is not configured." }, { status: 500 }) };
  }
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return { error: NextResponse.json({ error: "Missing auth token." }, { status: 401 }) };
  }
  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const authRes = await authClient.auth.getUser(token);
  const user = authRes.data.user;
  if (authRes.error || !user) {
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }
  const email = user.email?.trim().toLowerCase() ?? "";
  if (!superAdminEmail || email !== superAdminEmail) {
    return { error: NextResponse.json({ error: "Only Super User can manage announcements." }, { status: 403 }) };
  }
  return { user };
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const client = createClient(supabaseUrl!, serviceRoleKey!);
  const res = await client
    .from("site_announcements")
    .select("id,title,body,is_active,updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (res.error) {
    if (isMissingTableError(res.error.message)) return NextResponse.json({ announcement: null });
    return NextResponse.json({ error: res.error.message }, { status: 500 });
  }
  return NextResponse.json({ announcement: res.data ?? null });
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const client = createClient(supabaseUrl!, serviceRoleKey!);
  const body = await req.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const bodyText = typeof body?.body === "string" ? body.body.trim() : "";
  const isActive = Boolean(body?.isActive);

  const existingRes = await client.from("site_announcements").select("id").limit(1).maybeSingle();
  if (existingRes.error && !isMissingTableError(existingRes.error.message)) {
    return NextResponse.json({ error: existingRes.error.message }, { status: 500 });
  }

  const payload = {
    title,
    body: bodyText,
    is_active: isActive,
    updated_by_user_id: auth.user.id,
    updated_at: new Date().toISOString(),
  };

  const writeRes = existingRes.data?.id
    ? await client.from("site_announcements").update(payload).eq("id", existingRes.data.id)
    : await client.from("site_announcements").insert(payload);

  if (writeRes.error) {
    return NextResponse.json({ error: writeRes.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
