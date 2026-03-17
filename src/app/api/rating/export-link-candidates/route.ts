import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sharedRatingApiKey = process.env.SHARED_RATING_API_KEY?.trim() ?? "";

export async function POST(req: NextRequest) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }
  if (!sharedRatingApiKey) {
    return NextResponse.json({ error: "Shared rating API key is not configured." }, { status: 500 });
  }

  const suppliedKey = req.headers.get("x-shared-rating-key")?.trim() ?? "";
  if (!suppliedKey || suppliedKey !== sharedRatingApiKey) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const sourceApp = body?.source_app === "club" || body?.source_app === "league" ? body.source_app : null;
  if (!sourceApp) {
    return NextResponse.json({ error: "source_app is required." }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const [playersRes, locationsRes, appUsersRes, linksRes] = await Promise.all([
    adminClient
      .from("players")
      .select("id,display_name,full_name,location_id,is_archived")
      .eq("is_archived", false)
      .order("full_name"),
    adminClient.from("locations").select("id,name"),
    adminClient.from("app_users").select("email,linked_player_id"),
    adminClient.from("external_player_links").select("league_player_id,source_player_id,source_app").eq("source_app", sourceApp),
  ]);

  if (playersRes.error || locationsRes.error || appUsersRes.error || linksRes.error) {
    return NextResponse.json(
      {
        error:
          playersRes.error?.message ??
          locationsRes.error?.message ??
          appUsersRes.error?.message ??
          linksRes.error?.message ??
          "Failed to load link candidates.",
      },
      { status: 400 }
    );
  }

  const locationById = new Map(((locationsRes.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]));
  const emailByPlayerId = new Map(
    ((appUsersRes.data ?? []) as Array<{ email: string | null; linked_player_id: string | null }>)
      .filter((row) => row.linked_player_id && row.email)
      .map((row) => [row.linked_player_id as string, row.email as string])
  );

  return NextResponse.json({
    ok: true,
    players: ((playersRes.data ?? []) as Array<{ id: string; display_name: string; full_name: string | null; location_id: string | null }>).map(
      (player) => ({
        id: player.id,
        display_name: player.display_name,
        full_name: player.full_name,
        location_id: player.location_id,
        location_name: player.location_id ? locationById.get(player.location_id) ?? null : null,
        linked_email: emailByPlayerId.get(player.id) ?? null,
      })
    ),
    links: linksRes.data ?? [],
  });
}
