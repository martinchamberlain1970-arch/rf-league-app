import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { canManageLeagueRole } from "@/lib/app-roles";
import { hasScorecardOpponents, privateScorecardHeaders, scorecardMatchFields, scorecardTokenHash } from "@/lib/competition-scorecard-links";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: privateScorecardHeaders });

export async function POST(request: NextRequest) {
  if (!url || !anonKey || !serviceKey) return reply({ error: "Scorecard links are unavailable." }, 503);
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return reply({ error: "Sign in to manage private scorecard links." }, 401);

  try {
    const auth = await createClient(url, anonKey).auth.getUser(token);
    const user = auth.data.user;
    if (!user || auth.error) return reply({ error: "Sign in to manage private scorecard links." }, 401);

    const client = createClient(url, serviceKey);
    const role = await client.from("app_users").select("role").eq("id", user.id).maybeSingle();
    if (role.error) throw role.error;
    if (!canManageLeagueRole(role.data?.role)) return reply({ error: "League officer access is required." }, 403);

    const { matchId, action } = await request.json().catch(() => ({}));
    if (typeof matchId !== "string" || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(matchId) || !["issue", "revoke"].includes(action)) {
      return reply({ error: "Select a valid competition match." }, 400);
    }
    if (action === "revoke") {
      const revoked = await client.from("competition_scorecard_links").delete().eq("match_id", matchId);
      if (revoked.error) throw revoked.error;
      return reply({ ok: true });
    }

    const match = await client.from("matches").select(scorecardMatchFields).eq("id", matchId).eq("is_archived", false).maybeSingle();
    if (match.error) throw match.error;
    if (!match.data?.competition_id || !["pending", "in_progress"].includes(match.data.status) || !hasScorecardOpponents(match.data)) {
      return reply({ error: "A private link requires an open match with both opponents confirmed." }, 409);
    }
    const [competition, pending] = await Promise.all([
      client.from("competitions").select("id").eq("id", match.data.competition_id)
        .eq("competition_format", "knockout").eq("is_archived", false).eq("is_completed", false).maybeSingle(),
      client.from("competition_result_submissions").select("id").eq("match_id", matchId).eq("status", "pending").limit(1),
    ]);
    if (competition.error || pending.error) throw competition.error ?? pending.error;
    if (!competition.data || pending.data?.length) return reply({ error: "This match is unavailable for a new scorecard." }, 409);

    const guestToken = randomBytes(12).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const issued = await client.from("competition_scorecard_links").upsert({
      match_id: matchId, token_hash: scorecardTokenHash(guestToken),
      issued_by: user.id, expires_at: expiresAt, used_at: null,
    }, { onConflict: "match_id" });
    if (issued.error) throw issued.error;
    return reply({ path: `/competition-scorecard#${guestToken}`, expiresAt });
  } catch {
    return reply({ error: "The private scorecard link could not be updated. Try again." }, 500);
  }
}
