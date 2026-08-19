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

  const [seasonRes, teamRes, competitionsRes] = await Promise.all([
    client.from("league_seasons").select("id,name,is_completed").eq("id", pack.season_id).maybeSingle(),
    client.from("league_teams").select("id,name,location_id").eq("id", pack.team_id).maybeSingle(),
    client
      .from("competitions")
      .select("id,name,match_mode,sport_type,signup_deadline,is_archived,is_completed")
      .eq("competition_format", "knockout")
      .eq("is_archived", false)
      .eq("is_completed", false)
      .order("name"),
  ]);
  const firstError = seasonRes.error?.message || teamRes.error?.message || competitionsRes.error?.message;
  if (firstError) return NextResponse.json({ error: firstError }, { status: 400, headers: noStore });
  if (!seasonRes.data || !teamRes.data) return NextResponse.json({ error: "The linked league team is no longer available." }, { status: 404, headers: noStore });

  const normalizedPack = normalizeEntryPackPayload({
    contactName: pack.contact_name,
    contactEmail: pack.contact_email,
    contactPhone: pack.contact_phone,
    players: pack.players,
    competitionNotes: pack.competition_notes,
    generalNotes: pack.general_notes,
    phoneSharingConfirmed: pack.phone_sharing_confirmed,
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
      competitions: competitionsRes.data ?? [],
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
  if (loaded.pack.status === "approved") {
    return NextResponse.json({ error: "This entry pack has been approved and is now read-only. Contact a league officer for changes." }, { status: 409, headers: noStore });
  }

  const body = await req.json().catch(() => null);
  const action = body?.action === "submit" ? "submit" : "save";
  const payload = normalizeEntryPackPayload(body?.pack);
  const validationError = validateEntryPackPayload(payload, action === "submit");
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400, headers: noStore });

  const competitionIds = Array.from(new Set(payload.players.flatMap((player) => player.competitionIds)));
  if (competitionIds.length > 0) {
    const competitionRes = await client.from("competitions").select("id").in("id", competitionIds).eq("competition_format", "knockout").eq("is_archived", false).eq("is_completed", false);
    if (competitionRes.error) return NextResponse.json({ error: competitionRes.error.message }, { status: 400, headers: noStore });
    const allowed = new Set((competitionRes.data ?? []).map((row) => row.id));
    if (competitionIds.some((id) => !allowed.has(id))) {
      return NextResponse.json({ error: "One or more selected competitions are no longer available." }, { status: 400, headers: noStore });
    }
  }

  const now = new Date().toISOString();
  const updateRes = await client
    .from("league_entry_packs")
    .update({
      status: action === "submit" ? "submitted" : "draft",
      contact_name: payload.contactName,
      contact_email: payload.contactEmail || null,
      contact_phone: payload.contactPhone,
      players: payload.players,
      competition_notes: payload.competitionNotes || null,
      general_notes: payload.generalNotes || null,
      phone_sharing_confirmed: payload.phoneSharingConfirmed,
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
