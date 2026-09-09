import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notificationEmailIsConfigured, sendNotificationEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const noStore = { "Cache-Control": "no-store, max-age=0" };

async function authorize(request: NextRequest) {
  if (!supabaseUrl || !serviceRoleKey) return null;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userResult = await client.auth.getUser(token);
  return userResult.data.user ? { client, user: userResult.data.user } : null;
}

function isMissingPreferencesTable(message?: string | null) {
  const value = (message ?? "").toLowerCase();
  return value.includes("notification_preferences") || value.includes("schema cache");
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth) return NextResponse.json({ error: "Sign in to manage notifications." }, { status: 401, headers: noStore });

  const result = await auth.client
    .from("notification_preferences")
    .select("email_enabled")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  const missingTable = Boolean(result.error && isMissingPreferencesTable(result.error.message));
  if (result.error && !missingTable) {
    return NextResponse.json({ error: result.error.message }, { status: 400, headers: noStore });
  }

  return NextResponse.json({
    databaseReady: !missingTable,
    emailConfigured: notificationEmailIsConfigured(),
    emailEnabled: Boolean(result.data?.email_enabled),
    email: auth.user.email ?? null,
  }, { headers: noStore });
}

export async function PATCH(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth) return NextResponse.json({ error: "Sign in to manage notifications." }, { status: 401, headers: noStore });
  const body = await request.json().catch(() => ({}));
  if (typeof body?.emailEnabled !== "boolean") {
    return NextResponse.json({ error: "A valid email notification setting is required." }, { status: 400, headers: noStore });
  }
  if (body.emailEnabled && !notificationEmailIsConfigured()) {
    return NextResponse.json({ error: "Email notifications are awaiting secure server configuration." }, { status: 503, headers: noStore });
  }

  const result = await auth.client.from("notification_preferences").upsert({
    user_id: auth.user.id,
    email_enabled: body.emailEnabled,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (result.error) {
    const error = isMissingPreferencesTable(result.error.message)
      ? "Email notifications need the latest Supabase migration before they can be enabled."
      : result.error.message;
    return NextResponse.json({ error }, { status: 400, headers: noStore });
  }
  const testDelivery = body.emailEnabled
    ? await sendNotificationEmail({
        to: auth.user.email,
        subject: "Rack & Frame email notifications are enabled",
        text: "You will now receive important league approval and submission alerts at this email address. You can turn email notifications off at any time from the Notifications screen.",
      })
    : null;
  return NextResponse.json({
    ok: true,
    emailEnabled: body.emailEnabled,
    confirmationSent: testDelivery?.sent ?? false,
    confirmationError: testDelivery?.reason ?? null,
  }, { headers: noStore });
}
