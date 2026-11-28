import type { SupabaseClient } from "@supabase/supabase-js";

const londonDate = (value: Date) => value.toLocaleDateString("sv-SE", { timeZone: "Europe/London" });

export async function loadLastLeagueFixture(client: SupabaseClient) {
  return client.from("league_fixtures")
    .select("fixture_date,league_seasons!inner(is_active,is_published)")
    .eq("league_seasons.is_active", true).eq("league_seasons.is_published", true)
    .in("status", ["pending", "in_progress", "complete"]).not("fixture_date", "is", null)
    .order("fixture_date", { ascending: false }).limit(1).maybeSingle();
}

export function semiFinalScheduleWarning(lastLeagueDate: string | null, deadline: string | undefined, now = new Date()) {
  if (!lastLeagueDate) return null;
  if (londonDate(now) >= lastLeagueDate) return "The last league fixture date has arrived and the semi-finals are still open.";
  if (!deadline) return "No semi-final deadline set.";
  if (londonDate(new Date(deadline)) >= lastLeagueDate) return "The semi-final deadline falls on or after the last league fixture.";
  return null;
}
