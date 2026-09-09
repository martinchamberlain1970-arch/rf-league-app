import type { SupabaseClient } from "@supabase/supabase-js";
import webPush from "web-push";
import { notificationEmailIsConfigured, sendNotificationEmail } from "@/lib/email";

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

function notificationUrl(path?: string) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const configuredBase =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return configuredBase ? new URL(path, configuredBase.endsWith("/") ? configuredBase : `${configuredBase}/`).toString() : path;
}

export function pushIsConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

function configurePush() {
  if (!pushIsConfigured()) throw new Error("Web Push is not configured.");
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT as string,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  );
}

export async function sendPushToUserIds(client: SupabaseClient, userIds: string[], payload: PushPayload) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  const pushConfigured = pushIsConfigured();
  const emailConfigured = notificationEmailIsConfigured();
  if (!uniqueUserIds.length) {
    return { sent: 0, failed: 0, configured: pushConfigured, emailSent: 0, emailFailed: 0, emailConfigured };
  }

  let sent = 0;
  let failed = 0;
  let pushError: string | undefined;
  if (pushConfigured) {
    configurePush();
    const subscriptionsResult = await client
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .in("user_id", uniqueUserIds)
      .eq("is_active", true);
    if (subscriptionsResult.error) {
      pushError = subscriptionsResult.error.message;
    } else {
      for (const subscription of subscriptionsResult.data ?? []) {
        try {
          await webPush.sendNotification(
            { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
            JSON.stringify(payload)
          );
          sent += 1;
        } catch (error) {
          failed += 1;
          const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
          if (statusCode === 404 || statusCode === 410) {
            await client.from("push_subscriptions").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", subscription.id);
          }
        }
      }
    }
  }

  let emailSent = 0;
  let emailFailed = 0;
  let emailError: string | undefined;
  if (emailConfigured) {
    const preferencesResult = await client
      .from("notification_preferences")
      .select("user_id")
      .in("user_id", uniqueUserIds)
      .eq("email_enabled", true);
    if (preferencesResult.error) {
      emailError = preferencesResult.error.message;
    } else {
      for (const preference of preferencesResult.data ?? []) {
        const userResult = await client.auth.admin.getUserById(preference.user_id);
        const email = userResult.data.user?.email?.trim() ?? "";
        if (!email) {
          emailFailed += 1;
          continue;
        }
        const delivery = await sendNotificationEmail({
          to: email,
          subject: payload.title,
          text: `${payload.body}${payload.url ? `\n\nOpen Rack & Frame: ${notificationUrl(payload.url)}` : ""}`,
        });
        if (delivery.sent) emailSent += 1;
        else emailFailed += 1;
      }
    }
  }

  return {
    sent,
    failed,
    configured: pushConfigured,
    emailSent,
    emailFailed,
    emailConfigured,
    ...(pushError ? { error: pushError } : {}),
    ...(emailError ? { emailError } : {}),
  };
}

export async function sendPushToLeagueManagers(client: SupabaseClient, payload: PushPayload, excludeUserIds: string[] = []) {
  const managersResult = await client
    .from("app_users")
    .select("id")
    .in("role", ["league_secretary", "league_chairman", "league_treasurer", "super", "owner"]);
  if (managersResult.error) return { sent: 0, failed: 0, configured: pushIsConfigured(), error: managersResult.error.message };
  const excluded = new Set(excludeUserIds);
  return sendPushToUserIds(client, (managersResult.data ?? []).map((row) => row.id).filter((id) => !excluded.has(id)), payload);
}
