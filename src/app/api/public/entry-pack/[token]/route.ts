import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeEntryPackPayload, validateEntryPackPayload } from "@/lib/league-entry-pack";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const noStore = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

async function loadPack(client: SupabaseClient, token: string) {
  if (!/^[a-f0-9]{48}$/i.test(token)) return { error: "Entry pack not found." as const, status: 404 };
  const packRes = await client
    .from("league_entry_packs")
    .select("id,season_id,team_id,status,contact_name,contact_email,contact_phone,players,competition_notes,general_notes,phone_sharing_confirmed,accuracy_confirmed,submitted_at,review_notes,updated_at")
    .eq("public_token", token)
    .maybeSingle();
  if (packRes.error) return { error: packRes.error.message, status: 400 };
  if (!packRes.data) return { error: "Entry pack not found." as const, status: 404 };
  return { pack: packRes.data };
}

export async function GET(_req: NextRequest, context: { params: Promise<{ token: string }> }) {
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers: noStore });
  const { token } = await context.params;
  const client = createClient(supabaseUrl, serviceRoleKey);
  const loaded = await loadPack(client, token);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status, headers: noStore });
  const pack = loaded.pack;

  const [seasonRes, teamRes, startedFixturesRes] = await Promise.all([
    client.from("league_seasons").select("id,name,is_active").eq("id", pack.season_id).maybeSingle(),
    client.from("league_teams").select("id,name,location_id").eq("id", pack.team_id).maybeSingle(),
    client.from("league_fixtures").select("id").eq("season_id", pack.season_id).in("status", ["in_progress", "complete"]).limit(1),
  ]);
  const firstError = seasonRes.error?.message || teamRes.error?.message || startedFixturesRes.error?.message;
  if (firstError) return NextResponse.json({ error: firstError }, { status: 400, headers: noStore });
  if (!seasonRes.data || !teamRes.data) return NextResponse.json({ error: "The linked league team is no longer available." }, { status: 404, headers: noStore });
  if (seasonRes.data.is_active === false || (startedFixturesRes.data?.length ?? 0) > 0) {
    return NextResponse.json({ error: "This league entry period has closed because the league is completed or already in progress." }, { status: 410, headers: noStore });
  }

  let clubPlayers: Array<{ id: string; name: string }> = [];
  if (teamRes.data.location_id) {
    const clubPlayersRes = await client
      .from("players")
      .select("id,full_name,display_name")
      .eq("location_id", teamRes.data.location_id)
      .or("is_archived.is.null,is_archived.eq.false")
      .order("display_name");
    if (clubPlayersRes.error) return NextResponse.json({ error: clubPlayersRes.error.message }, { status: 400, headers: noStore });
    clubPlayers = (clubPlayersRes.data ?? []).map((player) => ({
      id: player.id,
      name: player.full_name?.trim() || player.display_name,
    }));
  }

  const normalizedPack = normalizeEntryPackPayload({
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    players: Array.isArray(pack.players) ? pack.players.map((player: Record<string, unknown>) => ({ ...player, phoneNumber: "", email: "" })) : [],
    competitionNotes: pack.competition_notes,
    generalNotes: pack.general_notes,
    phoneSharingConfirmed: false,
    accuracyConfirmed: pack.accuracy_confirmed,
  });

  let locationName = "Club not set";
  if (teamRes.data.location_id) {
    const locationRes = await client.from("locations").select("name").eq("id", teamRes.data.location_id).maybeSingle();
    if (locationRes.data?.name) locationName = locationRes.data.name;
  }

  return NextResponse.json(
    {
      pack: {
        id: pack.id,
        status: pack.status,
        ...normalizedPack,
        submittedAt: pack.submitted_at,
        reviewNotes: pack.review_notes,
        updatedAt: pack.updated_at,
      },
      season: seasonRes.data,
      team: { ...teamRes.data, locationName },
      clubPlayers,
    },
    { headers: noStore }
  );
}

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers: noStore });
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > 250_000) return NextResponse.json({ error: "Entry pack is too large." }, { status: 413, headers: noStore });

  const { token } = await context.params;
  const client = createClient(supabaseUrl, serviceRoleKey);
  const loaded = await loadPack(client, token);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status, headers: noStore });
  const [seasonStatusRes, startedFixturesRes] = await Promise.all([
    client.from("league_seasons").select("is_active").eq("id", loaded.pack.season_id).maybeSingle(),
    client.from("league_fixtures").select("id").eq("season_id", loaded.pack.season_id).in("status", ["in_progress", "complete"]).limit(1),
  ]);
  const statusError = seasonStatusRes.error?.message || startedFixturesRes.error?.message;
  if (statusError) return NextResponse.json({ error: statusError }, { status: 400, headers: noStore });
  if (!seasonStatusRes.data || seasonStatusRes.data.is_active === false || (startedFixturesRes.data?.length ?? 0) > 0) {
    return NextResponse.json({ error: "This league entry period has closed because the league is completed or already in progress." }, { status: 410, headers: noStore });
  }
  if (loaded.pack.status === "approved") {
    return NextResponse.json({ error: "This entry pack has been approved and is now read-only. Contact a league officer for changes." }, { status: 409, headers: noStore });
  }

  const body = await req.json().catch(() => null);
  if (body?.action === "reset") {
    const now = new Date().toISOString();
    const resetRes = await client.from("league_entry_packs").update({
      status: "draft",
      contact_name: null,
      contact_email: null,
      contact_phone: null,
      players: [],
      competition_notes: null,
      general_notes: null,
      phone_sharing_confirmed: false,
      accuracy_confirmed: false,
      submitted_at: null,
      reviewed_at: null,
      reviewed_by_user_id: null,
      review_notes: null,
      updated_at: now,
    }).eq("id", loaded.pack.id);
    if (resetRes.error) return NextResponse.json({ error: resetRes.error.message }, { status: 400, headers: noStore });
    return NextResponse.json({ ok: true, status: "draft", updatedAt: now }, { headers: noStore });
  }
  const action = body?.action === "submit" ? "submit" : "save";
  const payload = normalizeEntryPackPayload(body?.pack);
  const validationError = validateEntryPackPayload(payload, action === "submit");
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400, headers: noStore });

  payload.contactName = "";
  payload.contactEmail = "";
  payload.contactPhone = "";
  payload.players = payload.players.map((player) => ({ ...player, phoneNumber: "", email: "", competitionIds: [] }));
  payload.competitionNotes = "";
  payload.phoneSharingConfirmed = false;

  const now = new Date().toISOString();
  const updateRes = await client
    .from("league_entry_packs")
    .update({
      status: action === "submit" ? "submitted" : "draft",
      contact_name: null,
      contact_email: null,
      contact_phone: null,
      players: payload.players,
      competition_notes: payload.competitionNotes || null,
      general_notes: payload.generalNotes || null,
      phone_sharing_confirmed: false,
      accuracy_confirmed: payload.accuracyConfirmed,
      submitted_at: action === "submit" ? now : null,
      reviewed_at: null,
      reviewed_by_user_id: null,
      review_notes: null,
      updated_at: now,
    })
    .eq("id", loaded.pack.id);
  if (updateRes.error) return NextResponse.json({ error: updateRes.error.message }, { status: 400, headers: noStore });
  return NextResponse.json({ ok: true, status: action === "submit" ? "submitted" : "draft", updatedAt: now }, { headers: noStore });
}
