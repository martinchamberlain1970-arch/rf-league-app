import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireLeagueManager } from "@/lib/server-role";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const slug = "premier-2026-27-restored-handicaps";

async function authorize(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) throw new Error("SERVER_NOT_CONFIGURED");
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("UNAUTHORIZED");
  const authClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const authResult = await authClient.auth.getUser(token);
  if (authResult.error || !authResult.data.user) throw new Error("UNAUTHORIZED");
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  await requireLeagueManager(adminClient, authResult.data.user);
  return adminClient;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  if (message === "SERVER_NOT_CONFIGURED") return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (message === "FORBIDDEN_LEAGUE_MANAGER") return NextResponse.json({ error: "League officer access is required." }, { status: 403 });
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(req: NextRequest) {
  try {
    const client = await authorize(req);
    const roundResult = await client.from("league_handicap_confirmation_rounds").select("id,title,is_open,snapshot_at").eq("slug", slug).single();
    if (roundResult.error) throw new Error(roundResult.error.message);
    const [playersResult, confirmationsResult] = await Promise.all([
      client.from("league_handicap_confirmation_players").select("team_id").eq("round_id", roundResult.data.id),
      client.from("league_handicap_team_confirmations").select("id,team_id,representative_name,representative_role,confirmed_at").eq("round_id", roundResult.data.id).order("confirmed_at"),
    ]);
    if (playersResult.error) throw new Error(playersResult.error.message);
    if (confirmationsResult.error) throw new Error(confirmationsResult.error.message);
    const teamIds = [...new Set((playersResult.data ?? []).map((row) => row.team_id))];
    const teamsResult = teamIds.length ? await client.from("league_teams").select("id,name").in("id", teamIds).order("name") : { data: [], error: null };
    if (teamsResult.error) throw new Error(teamsResult.error.message);
    const confirmationByTeam = new Map((confirmationsResult.data ?? []).map((row) => [row.team_id, row]));
    return NextResponse.json({
      round: roundResult.data,
      teams: (teamsResult.data ?? []).map((team) => ({ ...team, confirmation: confirmationByTeam.get(team.id) ?? null })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const client = await authorize(req);
    const body = await req.json().catch(() => ({}));
    if (typeof body?.isOpen !== "boolean") throw new Error("Select whether confirmations should be open or closed.");
    const updateResult = await client.from("league_handicap_confirmation_rounds").update({ is_open: body.isOpen, updated_at: new Date().toISOString() }).eq("slug", slug);
    if (updateResult.error) throw new Error(updateResult.error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const client = await authorize(req);
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id ?? "").trim();
    if (!id) throw new Error("Select a team confirmation to remove.");
    const deleteResult = await client.from("league_handicap_team_confirmations").delete().eq("id", id);
    if (deleteResult.error) throw new Error(deleteResult.error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
