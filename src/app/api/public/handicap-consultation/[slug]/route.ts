import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

function cleanText(value: unknown, maxLength = 120) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

async function getConsultation(client: SupabaseClient, slug: string) {
  const consultationRes = await client
    .from("handicap_consultations")
    .select("id,slug,title,season_label,statement,closes_at,is_open")
    .eq("slug", slug)
    .maybeSingle();
  if (consultationRes.error) {
    if (consultationRes.error.code === "42P01") throw new Error("CONSULTATION_NOT_ENABLED");
    throw new Error(consultationRes.error.message);
  }
  if (!consultationRes.data) throw new Error("CONSULTATION_NOT_FOUND");
  return consultationRes.data;
}

async function getEligibleClubs(client: SupabaseClient) {
  const seasonsRes = await client
    .from("league_seasons")
    .select("id,name")
    .ilike("name", "%2026/2027%");
  if (seasonsRes.error) throw new Error(seasonsRes.error.message);
  const seasonIds = (seasonsRes.data ?? []).map((season) => season.id);
  if (seasonIds.length === 0) return [];

  const teamsRes = await client
    .from("league_teams")
    .select("location_id")
    .in("season_id", seasonIds)
    .eq("is_active", true);
  if (teamsRes.error) throw new Error(teamsRes.error.message);
  const locationIds = [...new Set((teamsRes.data ?? []).map((team) => team.location_id).filter(Boolean))];
  if (locationIds.length === 0) return [];

  const locationsRes = await client.from("locations").select("id,name").in("id", locationIds).order("name");
  if (locationsRes.error) throw new Error(locationsRes.error.message);
  return locationsRes.data ?? [];
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "The consultation could not be loaded.";
  if (message === "CONSULTATION_NOT_ENABLED") return NextResponse.json({ error: "The attestation form has not been enabled yet." }, { status: 503, headers: noStore });
  if (message === "CONSULTATION_NOT_FOUND") return NextResponse.json({ error: "This consultation link is not available." }, { status: 404, headers: noStore });
  return NextResponse.json({ error: message }, { status: 400, headers: noStore });
}

export async function GET(_req: NextRequest, context: RouteContext) {
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers: noStore });
  try {
    const { slug } = await context.params;
    const client = createClient(supabaseUrl, serviceRoleKey);
    const consultation = await getConsultation(client, slug);
    const clubs = await getEligibleClubs(client);
    const responsesRes = await client
      .from("handicap_consultation_attestations")
      .select("location_id,submitted_at")
      .eq("consultation_id", consultation.id);
    if (responsesRes.error) throw new Error(responsesRes.error.message);
    const responseByClub = new Map((responsesRes.data ?? []).map((response) => [response.location_id, response.submitted_at]));
    const closed = !consultation.is_open || Boolean(consultation.closes_at && new Date(consultation.closes_at).getTime() <= Date.now());
    return NextResponse.json({
      consultation: { ...consultation, closed },
      clubs: clubs.map((club) => ({ id: club.id, name: club.name, submittedAt: responseByClub.get(club.id) ?? null })),
    }, { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers: noStore });
  try {
    const body = await req.json().catch(() => ({}));
    if (cleanText(body?.website, 200)) return NextResponse.json({ ok: true }, { headers: noStore });
    const locationId = cleanText(body?.locationId, 60);
    const attestorName = cleanText(body?.attestorName);
    const capacity = cleanText(body?.capacity, 40);
    if (!locationId) throw new Error("Select the club you are representing.");
    if (attestorName.split(" ").filter(Boolean).length < 2) throw new Error("Enter your full first and second name.");
    if (!['captain', 'club_representative'].includes(capacity)) throw new Error("Select your role for the club.");
    if (body?.agreed !== true) throw new Error("You must confirm the complete statement before submitting.");

    const { slug } = await context.params;
    const client = createClient(supabaseUrl, serviceRoleKey);
    const consultation = await getConsultation(client, slug);
    const closed = !consultation.is_open || Boolean(consultation.closes_at && new Date(consultation.closes_at).getTime() <= Date.now());
    if (closed) throw new Error("This consultation is now closed.");
    const clubs = await getEligibleClubs(client);
    if (!clubs.some((club) => club.id === locationId)) throw new Error("The selected club is not included in this consultation.");

    const insertRes = await client.from("handicap_consultation_attestations").insert({
      consultation_id: consultation.id,
      location_id: locationId,
      attestor_name: attestorName,
      attestor_capacity: capacity,
      attestation_text: consultation.statement,
      agreed: true,
    });
    if (insertRes.error?.code === "23505") {
      return NextResponse.json({ error: "An attestation has already been submitted for this club. Contact the League Secretary if it needs correcting." }, { status: 409, headers: noStore });
    }
    if (insertRes.error) throw new Error(insertRes.error.message);
    return NextResponse.json({ ok: true, clubName: clubs.find((club) => club.id === locationId)?.name ?? "Your club" }, { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}
