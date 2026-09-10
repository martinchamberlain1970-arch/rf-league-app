import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ROUND_SLUG = "premier-2026-27-restored-handicaps";
const DEADLINE_ISO = "2026-09-10T18:00:00.000Z"; // 19:00 Europe/London (BST)
const SYSTEM_NAME = "System auto-attestation — no response received by 19:00 BST";
const noStore = { "Cache-Control": "no-store, max-age=0" };

function isCronRequest(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) return request.headers.get("authorization") === `Bearer ${secret}`;
  return request.headers.get("user-agent") === "vercel-cron/1.0";
}

export async function GET(request: NextRequest) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: noStore });
  }
  if (Date.now() < new Date(DEADLINE_ISO).getTime()) {
    return NextResponse.json({ error: "The 19:00 BST deadline has not been reached." }, { status: 409, headers: noStore });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers: noStore });
  }

  try {
    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const roundResult = await client
      .from("league_handicap_confirmation_rounds")
      .select("id,title,statement")
      .eq("slug", ROUND_SLUG)
      .single();
    if (roundResult.error) throw new Error(roundResult.error.message);
    const round = roundResult.data;

    const [playersResult, confirmationsResult] = await Promise.all([
      client
        .from("league_handicap_confirmation_players")
        .select("team_id,player_id,is_captain,is_vice_captain")
        .eq("round_id", round.id),
      client
        .from("league_handicap_team_confirmations")
        .select("team_id")
        .eq("round_id", round.id),
    ]);
    if (playersResult.error) throw new Error(playersResult.error.message);
    if (confirmationsResult.error) throw new Error(confirmationsResult.error.message);

    const playersByTeam = new Map<string, Array<{ player_id: string; is_captain: boolean; is_vice_captain: boolean }>>();
    for (const player of playersResult.data ?? []) {
      const players = playersByTeam.get(player.team_id) ?? [];
      players.push(player);
      playersByTeam.set(player.team_id, players);
    }
    const confirmedTeamIds = new Set((confirmationsResult.data ?? []).map((row) => row.team_id));
    const missingTeamIds = [...playersByTeam.keys()].filter((teamId) => !confirmedTeamIds.has(teamId));
    const teamsResult = missingTeamIds.length
      ? await client.from("league_teams").select("id,name").in("id", missingTeamIds)
      : { data: [], error: null };
    if (teamsResult.error) throw new Error(teamsResult.error.message);
    const teamNames = new Map((teamsResult.data ?? []).map((team) => [team.id, team.name]));

    const pending = missingTeamIds.map((teamId) => {
      const players = playersByTeam.get(teamId) ?? [];
      const representative =
        players.find((player) => player.is_captain) ??
        players.find((player) => player.is_vice_captain) ??
        players[0];
      if (!representative) throw new Error(`No snapshot player is available for team ${teamId}.`);
      return { teamId, teamName: teamNames.get(teamId) ?? teamId, representative };
    });

    const completedAt = new Date().toISOString();
    let autoAttested: typeof pending = [];
    if (pending.length) {
      const insertResult = await client
        .from("league_handicap_team_confirmations")
        .upsert(pending.map(({ teamId, representative }) => ({
          round_id: round.id,
          team_id: teamId,
          representative_player_id: representative.player_id,
          representative_name: SYSTEM_NAME,
          representative_role: representative.is_vice_captain && !representative.is_captain ? "vice_captain" : "captain",
          attestation_text: `${round.statement}\n\nSystem record: no team attestation had been received by the 19:00 BST deadline on 10 September 2026. This entry was created automatically and does not claim that the team's captain or vice-captain submitted it.`,
          confirmed_at: completedAt,
        })), { onConflict: "round_id,team_id", ignoreDuplicates: true });
      if (insertResult.error) throw new Error(insertResult.error.message);

      const insertedResult = await client
        .from("league_handicap_team_confirmations")
        .select("team_id,representative_name")
        .eq("round_id", round.id)
        .in("team_id", pending.map(({ teamId }) => teamId));
      if (insertedResult.error) throw new Error(insertedResult.error.message);
      const systemTeamIds = new Set(
        (insertedResult.data ?? [])
          .filter((row) => row.representative_name === SYSTEM_NAME)
          .map((row) => row.team_id),
      );
      autoAttested = pending.filter(({ teamId }) => systemTeamIds.has(teamId));

      if (autoAttested.length) {
        const auditResult = await client.from("audit_logs").insert(autoAttested.map(({ teamId, teamName, representative }) => ({
          actor_user_id: null,
          actor_email: "system@rack-and-frame.local",
          actor_role: "system",
          action: "premier_handicap_auto_attested",
          entity_type: "league_handicap_team_confirmation",
          entity_id: teamId,
          summary: `${teamName} was auto-attested because no confirmation was received by the 19:00 BST deadline.`,
          meta: {
            round_id: round.id,
            round_slug: ROUND_SLUG,
            team_id: teamId,
            team_name: teamName,
            deadline: DEADLINE_ISO,
            auto_attested_at: completedAt,
            technical_representative_player_id: representative.player_id,
            source: "vercel_scheduled_deadline_process",
          },
        })));
        if (auditResult.error) {
          await client
            .from("league_handicap_team_confirmations")
            .delete()
            .eq("round_id", round.id)
            .eq("representative_name", SYSTEM_NAME)
            .in("team_id", [...systemTeamIds]);
          throw new Error(`Auto-attestations were rolled back because audit logging failed: ${auditResult.error.message}`);
        }
      }
    }

    const closeResult = await client
      .from("league_handicap_confirmation_rounds")
      .update({ is_open: false, updated_at: completedAt })
      .eq("id", round.id);
    if (closeResult.error) throw new Error(closeResult.error.message);

    return NextResponse.json({
      ok: true,
      deadline: DEADLINE_ISO,
      alreadyAttested: confirmedTeamIds.size,
      autoAttested: autoAttested.length,
      teams: autoAttested.map(({ teamName }) => teamName),
      confirmationsClosed: true,
      completedAt,
    }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The auto-attestation process failed.";
    return NextResponse.json({ error: message }, { status: 500, headers: noStore });
  }
}
