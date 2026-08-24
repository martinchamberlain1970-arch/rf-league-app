import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pushIsConfigured, sendPushToUserIds } from "@/lib/push-server";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const noStore = { "Cache-Control": "no-store, max-age=0" };

async function authorize(request: NextRequest) {
  if (!supabaseUrl || !serviceRoleKey) return null;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const userResult = await client.auth.getUser(token);
  return userResult.data.user ? { client, user: userResult.data.user } : null;
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth) return NextResponse.json({ error: "Sign in to manage notifications." }, { status: 401, headers: noStore });
  const result = await auth.client.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", auth.user.id).eq("is_active", true);
  const missingTable = result.error?.message.toLowerCase().includes("push_subscriptions") || result.error?.message.toLowerCase().includes("schema cache");
  if (result.error && !missingTable) return NextResponse.json({ error: result.error.message }, { status: 400, headers: noStore });
  return NextResponse.json({
    configured: pushIsConfigured(),
    databaseReady: !missingTable,
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
    subscriptionCount: result.count ?? 0,
  }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth) return NextResponse.json({ error: "Sign in to enable notifications." }, { status: 401, headers: noStore });
  const body = await request.json().catch(() => ({}));
  if (body?.action === "test") {
    const result = await sendPushToUserIds(auth.client, [auth.user.id], {
      title: "Rack & Frame League notifications are working",
      body: "This device can now receive important league, fixture, result and competition updates.",
      url: "/notifications",
      tag: "league-push-test",
    });
    return NextResponse.json({ ok: true, ...result }, { headers: noStore });
  }
  const subscription = body?.subscription;
  const endpoint = String(subscription?.endpoint ?? "");
  const p256dh = String(subscription?.keys?.p256dh ?? "");
  const keyAuth = String(subscription?.keys?.auth ?? "");
  if (!endpoint || !p256dh || !keyAuth) return NextResponse.json({ error: "A valid push subscription is required." }, { status: 400, headers: noStore });
  const result = await auth.client.from("push_subscriptions").upsert({
    user_id: auth.user.id,
    endpoint,
    p256dh,
    auth: keyAuth,
    user_agent: request.headers.get("user-agent"),
    is_active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400, headers: noStore });
  return NextResponse.json({ ok: true }, { headers: noStore });
}

export async function DELETE(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth) return NextResponse.json({ error: "Sign in to disable notifications." }, { status: 401, headers: noStore });
  const body = await request.json().catch(() => ({}));
  const endpoint = String(body?.endpoint ?? "");
  if (endpoint) await auth.client.from("push_subscriptions").update({ is_active: false, updated_at: new Date().toISOString() }).eq("user_id", auth.user.id).eq("endpoint", endpoint);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
