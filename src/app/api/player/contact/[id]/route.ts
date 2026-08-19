import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canManageLeagueRole } from "@/lib/app-roles";
import { resolveServerRole } from "@/lib/server-role";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { "Cache-Control": "private, no-store, max-age=0" };

const participantIds = (match: Record<string, unknown>) =>
  ["player1_id", "player2_id", "team1_player1_id", "team1_player2_id", "team2_player1_id", "team2_player2_id"]
    .map((key) => String(match[key] ?? ""))
    .filter(Boolean);

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Missing auth token." }, { status: 401, headers });
  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const authRes = await authClient.auth.getUser(token);
  if (authRes.error || !authRes.data.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers });

  const { id: targetPlayerId } = await context.params;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const [role, appUserRes, contactRes] = await Promise.all([
    resolveServerRole(adminClient, authRes.data.user),
    adminClient.from("app_users").select("linked_player_id").eq("id", authRes.data.user.id).maybeSingle(),
    adminClient.from("player_private_contacts").select("phone_number,phone_share_consent").eq("player_id", targetPlayerId).maybeSingle(),
  ]);
  if (appUserRes.error || contactRes.error) return NextResponse.json({ error: appUserRes.error?.message ?? contactRes.error?.message }, { status: 400, headers });
  if (!contactRes.data?.phone_number) return NextResponse.json({ phoneNumber: null, phoneShareConsent: Boolean(contactRes.data?.phone_share_consent), allowed: false }, { headers });

  const requesterPlayerId = appUserRes.data?.linked_player_id as string | null;
  let allowed = canManageLeagueRole(role) || requesterPlayerId === targetPlayerId;
  let accessReason = canManageLeagueRole(role) ? "league_officer" : requesterPlayerId === targetPlayerId ? "own_profile" : null;

  if (!allowed && requesterPlayerId && contactRes.data.phone_share_consent) {
    const matchRes = await adminClient
      .from("matches")
      .select("player1_id,player2_id,team1_player1_id,team1_player2_id,team2_player1_id,team2_player2_id,status")
      .in("status", ["pending", "in_progress"])
      .or([
        `player1_id.eq.${requesterPlayerId}`,
        `player2_id.eq.${requesterPlayerId}`,
        `team1_player1_id.eq.${requesterPlayerId}`,
        `team1_player2_id.eq.${requesterPlayerId}`,
        `team2_player1_id.eq.${requesterPlayerId}`,
        `team2_player2_id.eq.${requesterPlayerId}`,
      ].join(","));
    if (matchRes.error) return NextResponse.json({ error: matchRes.error.message }, { status: 400, headers });
    allowed = (matchRes.data ?? []).some((match) => participantIds(match).includes(targetPlayerId));
    if (allowed) accessReason = "drawn_opponent";
  }

  if (!allowed && requesterPlayerId && contactRes.data.phone_share_consent) {
    const captainRes = await adminClient
      .from("league_team_members")
      .select("season_id,team_id,is_captain,is_vice_captain")
      .eq("player_id", requesterPlayerId);
    if (captainRes.error) return NextResponse.json({ error: captainRes.error.message }, { status: 400, headers });
    const managed = (captainRes.data ?? []).filter((member) => member.is_captain || member.is_vice_captain);
    if (managed.length > 0) {
      const targetMembershipRes = await adminClient
        .from("league_team_members")
        .select("season_id,team_id")
        .eq("player_id", targetPlayerId);
      if (targetMembershipRes.error) return NextResponse.json({ error: targetMembershipRes.error.message }, { status: 400, headers });
      allowed = (targetMembershipRes.data ?? []).some((target) => managed.some((own) => own.season_id === target.season_id && own.team_id === target.team_id));
      if (allowed) accessReason = "team_captain";
    }
  }

  if (!allowed) return NextResponse.json({ phoneNumber: null, phoneShareConsent: false, allowed: false }, { headers });
  return NextResponse.json({ phoneNumber: contactRes.data.phone_number, phoneShareConsent: Boolean(contactRes.data.phone_share_consent), allowed: true, accessReason }, { headers });
}
