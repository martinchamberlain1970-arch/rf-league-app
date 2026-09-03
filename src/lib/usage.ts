import { supabase } from "@/lib/supabase";

const THROTTLE_MS = 10 * 60 * 1000;
const USAGE_CONSENT_KEY = "rf_usage_tracking_consent";

export async function logUsagePageView(path: string): Promise<void> {
  const client = supabase;
  if (!client || !path) return;
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(USAGE_CONSENT_KEY) !== "granted") return;

  try {
    const { data } = await client.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return;

    const key = `usage:last:${uid}:${path}`;
    const now = Date.now();
    const lastRaw = window.localStorage.getItem(key);
    const last = lastRaw ? Number(lastRaw) : 0;
    if (last && !Number.isNaN(last) && now - last < THROTTLE_MS) return;

    window.localStorage.setItem(key, String(now));
    await client.rpc("log_usage_event", {
      p_path: path,
      p_meta: { source: "web" },
    });
  } catch {
    // Usage tracking must never break the UX.
  }
}
