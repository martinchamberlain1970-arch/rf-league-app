import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ?? process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL?.trim().toLowerCase() ?? "";

function targetHandicapFromElo(rating: number) {
  if (rating >= 1320) return -64;
  if (rating >= 1280) return -56;
  if (rating >= 1240) return -48;
  if (rating >= 1200) return -40;
  if (rating >= 1160) return -32;
  if (rating >= 1120) return -24;
  if (rating >= 1080) return -16;
  if (rating >= 1040) return -8;
  if (rating >= 980) return 0;
  if (rating >= 940) return 8;
  if (rating >= 900) return 16;
  if (rating >= 860) return 24;
  if (rating >= 820) return 32;
  if (rating >= 780) return 40;
  if (rating >= 740) return 48;
  return 56;
}

export async function POST(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Missing auth token." }, { status: 401 });

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const authRes = await authClient.auth.getUser(token);
  const user = authRes.data.user;
  if (authRes.error || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const email = user.email?.trim().toLowerCase() ?? "";
  if (!superAdminEmail || email !== superAdminEmail) {
    return NextResponse.json({ error: "Only Super User can recalculate handicaps." }, { status: 403 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const playersRes = await adminClient
    .from("players")
    .select("id,full_name,display_name,is_archived,rating_snooker,snooker_handicap")
    .eq("is_archived", false);
  if (playersRes.error) {
    return NextResponse.json({ error: playersRes.error.message }, { status: 400 });
  }

  const teamMembersRes = await adminClient.from("league_registered_team_members").select("player_id");
  if (teamMembersRes.error) {
    return NextResponse.json({ error: teamMembersRes.error.message }, { status: 400 });
  }
  const leaguePlayerIds = new Set((teamMembersRes.data ?? []).map((row) => row.player_id).filter(Boolean));
  const players = (playersRes.data ?? []).filter((row) => leaguePlayerIds.has(row.id));

  const changed: Array<{ id: string; previous: number; next: number; rating: number }> = [];
  for (const player of players) {
    const rating = Number(player.rating_snooker ?? 1000);
    const current = Number(player.snooker_handicap ?? 0);
    const target = targetHandicapFromElo(rating);
    const next =
      target > current ? Math.min(current + 4, target) : target < current ? Math.max(current - 4, target) : current;
    if (next === current) continue;
    changed.push({ id: player.id, previous: current, next, rating });
  }

  for (const row of changed) {
    const updateRes = await adminClient.from("players").update({ snooker_handicap: row.next }).eq("id", row.id);
    if (updateRes.error) {
      return NextResponse.json({ error: updateRes.error.message }, { status: 400 });
    }
  }

  if (changed.length > 0) {
    const histRes = await adminClient.from("league_handicap_history").insert(
      changed.map((row) => ({
        player_id: row.id,
        change_type: "weekly_elo_review",
        delta: row.next - row.previous,
        previous_handicap: row.previous,
        new_handicap: row.next,
        reason: `Weekly Elo review (rating ${Math.round(row.rating)})`,
        changed_by_user_id: user.id,
      }))
    );
    if (histRes.error) {
      return NextResponse.json({ error: histRes.error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, reviewed: players.length, changed: changed.length });
}
