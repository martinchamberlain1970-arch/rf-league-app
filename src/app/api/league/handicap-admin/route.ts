import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ?? process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL?.trim().toLowerCase() ?? "";

type Mode = "set_current" | "set_base_and_current" | "adjust_current";

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
    return NextResponse.json({ error: "Only Super User can change handicaps." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    playerId?: string;
    mode?: Mode;
    value?: number;
    reason?: string;
  };

  const playerId = body.playerId?.trim() ?? "";
  const mode = body.mode;
  const value = Number(body.value);
  const reason = (body.reason ?? "").trim();
  if (!playerId || !mode || !Number.isFinite(value)) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
  if (value < -200 || value > 200) {
    return NextResponse.json({ error: "Handicap value must be between -200 and +200." }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const playerRes = await adminClient
    .from("players")
    .select("id,snooker_handicap,snooker_handicap_base,is_archived")
    .eq("id", playerId)
    .maybeSingle();

  if (playerRes.error || !playerRes.data) {
    return NextResponse.json({ error: playerRes.error?.message ?? "Player not found." }, { status: 404 });
  }
  if (playerRes.data.is_archived) return NextResponse.json({ error: "Cannot edit archived player handicap." }, { status: 400 });

  const previous = Number(playerRes.data.snooker_handicap ?? 0);
  const previousBase = Number(playerRes.data.snooker_handicap_base ?? playerRes.data.snooker_handicap ?? 0);
  let nextHandicap = previous;
  let nextBase: number | null = null;
  let changeType: "manual_adjustment" | "manual_override" | "baseline_override" = "manual_adjustment";

  if (mode === "adjust_current") {
    nextHandicap = previous + value;
    changeType = "manual_adjustment";
  } else if (mode === "set_current") {
    nextHandicap = value;
    changeType = "manual_override";
  } else if (mode === "set_base_and_current") {
    nextHandicap = value;
    nextBase = value;
    changeType = "baseline_override";
  }

  const updatePayload: { snooker_handicap: number; snooker_handicap_base?: number } = { snooker_handicap: nextHandicap };
  if (nextBase !== null) updatePayload.snooker_handicap_base = nextBase;

  const updateRes = await adminClient.from("players").update(updatePayload).eq("id", playerId);
  if (updateRes.error) return NextResponse.json({ error: updateRes.error.message }, { status: 400 });

  const delta = nextHandicap - previous;
  const histRes = await adminClient.from("league_handicap_history").insert({
    player_id: playerId,
    change_type: changeType,
    delta,
    previous_handicap: previous,
    new_handicap: nextHandicap,
    reason: reason || (mode === "set_base_and_current" ? "Baseline override by Super User" : "Manual adjustment by Super User"),
    changed_by_user_id: user.id,
  });
  if (histRes.error) {
    return NextResponse.json({ error: histRes.error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    previous,
    next: nextHandicap,
    previousBase,
    nextBase: nextBase ?? previousBase,
  });
}
