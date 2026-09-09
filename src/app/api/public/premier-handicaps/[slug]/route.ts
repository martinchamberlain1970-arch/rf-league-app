import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sendPushToLeagueManagers } from "@/lib/push-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const noStore = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

type RouteContext = { params: Promise<{ slug: string }> };

function cleanId(value: unknown) {
  return String(value ?? "").trim().slice(0, 60);
}

async function getRound(client: SupabaseClient, slug: string) {
  const result = await client
    .from("league_handicap_confirmation_rounds")
    .select("id,season_id,slug,title,statement,is_open,snapshot_at")
    .eq("slug", slug)
    .maybeSingle();
  if (result.error && (result.error.code === "42P01" || /schema cache|does not exist/i.test(result.error.message))) throw new Error("NOT_ENABLED");
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("NOT_FOUND");
  return result.data;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "The handicap confirmation page could not be loaded.";
  if (message === "NOT_ENABLED") return NextResponse.json({ error: "The handicap confirmation page has not been enabled yet." }, { status: 503, headers: noStore });
  if (message === "NOT_FOUND") return NextResponse.json({ error: "This handicap confirmation link is not available." }, { status: 404, headers: noStore });
  return NextResponse.json({ error: message }, { status: 400, headers: noStore });
}

export async function GET(_request: NextRequest, context: RouteContext) {
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers: noStore });
  try {
    const { slug } = await context.params;
    const client = createClient(supabaseUrl, serviceRoleKey);
    const round = await getRound(client, slug);
    const [playersResult, confirmationsResult] = await Promise.all([
      client
        .from("league_handicap_confirmation_players")
        .select("team_id,player_id,player_name,elo_rating,handicap,is_captain,is_vice_captain")
        .eq("round_id", round.id),
      client
        .from("league_handicap_team_confirmations")
        .select("team_id,representative_name,representative_role,confirmed_at")
        .eq("round_id", round.id),
    ]);
    if (playersResult.error) throw new Error(playersResult.error.message);
    if (confirmationsResult.error) throw new Error(confirmationsResult.error.message);

    const teamIds = [...new Set((playersResult.data ?? []).map((row) => row.team_id))];
    const teamsResult = teamIds.length
      ? await client.from("league_teams").select("id,name").in("id", teamIds).order("name")
      : { data: [], error: null };
    if (teamsResult.error) throw new Error(teamsResult.error.message);
    const confirmationByTeam = new Map((confirmationsResult.data ?? []).map((row) => [row.team_id, row]));
    const teams = (teamsResult.data ?? []).map((team) => {
      const confirmation = confirmationByTeam.get(team.id);
      const teamPlayers = (playersResult.data ?? [])
        .filter((player) => player.team_id === team.id)
        .sort((left, right) => left.player_name.localeCompare(right.player_name));
      return {
        id: team.id,
        name: team.name,
        confirmedAt: confirmation?.confirmed_at ?? null,
        confirmedBy: confirmation?.representative_name ?? null,
        players: teamPlayers.map((player) => ({
          id: player.player_id,
          name: player.player_name,
          handicap: player.handicap,
        })),
        representatives: teamPlayers
          .filter((player) => player.is_captain || player.is_vice_captain)
          .map((player) => ({
            id: player.player_id,
            name: player.player_name,
            role: player.is_captain ? "Captain" : "Vice-captain",
          })),
      };
    });

    return NextResponse.json({ round, teams }, { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers: noStore });
  try {
    const body = await request.json().catch(() => ({}));
    if (String(body?.website ?? "").trim()) return NextResponse.json({ ok: true }, { headers: noStore });
    const teamId = cleanId(body?.teamId);
    const representativePlayerId = cleanId(body?.representativePlayerId);
    if (!teamId) throw new Error("Select the Premier League team you represent.");
    if (!representativePlayerId) throw new Error("Select the registered captain or vice-captain confirming the list.");
    if (body?.agreed !== true) throw new Error("Confirm that the published handicap list has been checked.");

    const { slug } = await context.params;
    const client = createClient(supabaseUrl, serviceRoleKey);
    const round = await getRound(client, slug);
    if (!round.is_open) throw new Error("This handicap confirmation is now closed.");

    const representativeResult = await client
      .from("league_handicap_confirmation_players")
      .select("player_id,player_name,is_captain,is_vice_captain")
      .eq("round_id", round.id)
      .eq("team_id", teamId)
      .eq("player_id", representativePlayerId)
      .maybeSingle();
    if (representativeResult.error) throw new Error(representativeResult.error.message);
    const representative = representativeResult.data;
    if (!representative || (!representative.is_captain && !representative.is_vice_captain)) {
      throw new Error("Only the registered captain or vice-captain for this team can submit its confirmation.");
    }

    const teamResult = await client.from("league_teams").select("name").eq("id", teamId).maybeSingle();
    if (teamResult.error || !teamResult.data) throw new Error("The selected Premier League team could not be found.");
    const representativeRole = representative.is_captain ? "captain" : "vice_captain";
    const insertResult = await client.from("league_handicap_team_confirmations").insert({
      round_id: round.id,
      team_id: teamId,
      representative_player_id: representative.player_id,
      representative_name: representative.player_name,
      representative_role: representativeRole,
      attestation_text: round.statement,
    });
    if (insertResult.error?.code === "23505") {
      return NextResponse.json({ error: "This team has already confirmed the handicap list. Contact the League Secretary if its confirmation needs correcting." }, { status: 409, headers: noStore });
    }
    if (insertResult.error) throw new Error(insertResult.error.message);

    await sendPushToLeagueManagers(client, {
      title: "Premier handicap confirmation received",
      body: `${teamResult.data.name} has confirmed the published pre-season handicap list.`,
      url: "/premier-handicap-confirmations",
      tag: `premier-handicap-confirmation-${teamId}`,
    });

    return NextResponse.json({ ok: true, teamName: teamResult.data.name }, { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}
