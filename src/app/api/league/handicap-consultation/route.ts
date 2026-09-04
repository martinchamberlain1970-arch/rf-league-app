import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireLeagueManager } from "@/lib/server-role";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function authorize(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) throw new Error("SERVER_NOT_CONFIGURED");
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("UNAUTHORIZED");
  const authClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const authRes = await authClient.auth.getUser(token);
  if (authRes.error || !authRes.data.user) throw new Error("UNAUTHORIZED");
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  await requireLeagueManager(adminClient, authRes.data.user);
  return adminClient;
}

function responseForError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  if (message === "SERVER_NOT_CONFIGURED") return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (message === "FORBIDDEN_LEAGUE_MANAGER") return NextResponse.json({ error: "League officer access is required." }, { status: 403 });
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(req: NextRequest) {
  try {
    const client = await authorize(req);
    const consultationRes = await client.from("handicap_consultations").select("id,slug,title,statement,closes_at,is_open").eq("slug", "premier-handicap-2026-27").single();
    if (consultationRes.error) throw new Error(consultationRes.error.message);
    const responsesRes = await client
      .from("handicap_consultation_attestations")
      .select("id,location_id,attestor_name,attestor_capacity,attestation_text,submitted_at")
      .eq("consultation_id", consultationRes.data.id)
      .order("submitted_at");
    if (responsesRes.error) throw new Error(responsesRes.error.message);
    const locationIds = [...new Set((responsesRes.data ?? []).map((row) => row.location_id))];
    const locationsRes = locationIds.length ? await client.from("locations").select("id,name").in("id", locationIds) : { data: [], error: null };
    if (locationsRes.error) throw new Error(locationsRes.error.message);
    const locationName = new Map((locationsRes.data ?? []).map((location) => [location.id, location.name]));
    return NextResponse.json({
      consultation: consultationRes.data,
      attestations: (responsesRes.data ?? []).map((row) => ({ ...row, clubName: locationName.get(row.location_id) ?? "Unknown club" })),
    });
  } catch (error) {
    return responseForError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const client = await authorize(req);
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id ?? "").trim();
    if (!id) throw new Error("Select an attestation to remove.");
    const deleteRes = await client.from("handicap_consultation_attestations").delete().eq("id", id);
    if (deleteRes.error) throw new Error(deleteRes.error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return responseForError(error);
  }
}
