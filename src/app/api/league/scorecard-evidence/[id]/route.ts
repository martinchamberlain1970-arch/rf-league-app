import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireLeagueManager } from "@/lib/server-role";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!supabaseUrl || !anonKey || !serviceKey) return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const auth = createClient(supabaseUrl, anonKey);
  const userRes = await auth.auth.getUser(token);
  if (userRes.error || !userRes.data.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const admin = createClient(supabaseUrl, serviceKey);
  try { await requireLeagueManager(admin, userRes.data.user); } catch { return NextResponse.json({ error: "League management access is required." }, { status: 403 }); }
  const { id } = await context.params;
  const submission = await admin.from("league_result_submissions").select("scorecard_photo_path,scorecard_evidence_deleted_at").eq("id", id).maybeSingle();
  if (submission.error || !submission.data?.scorecard_photo_path || submission.data.scorecard_evidence_deleted_at) {
    return NextResponse.json({ error: "The temporary scorecard image is no longer available." }, { status: 404 });
  }
  const signed = await admin.storage.from("temporary-scorecards").createSignedUrl(submission.data.scorecard_photo_path, 120);
  if (signed.error || !signed.data.signedUrl) return NextResponse.json({ error: "The temporary scorecard image could not be opened." }, { status: 400 });
  return NextResponse.json({ url: signed.data.signedUrl }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

