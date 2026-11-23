import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { emailFixtureCaptains } from "@/lib/fixture-date-emails";
import { requireLeagueManager } from "@/lib/server-role";

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return NextResponse.json({ error: "Server is not configured." }, { status: 500 });

  const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!token) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { data, error } = await createClient(url, anonKey).auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const admin = createClient(url, serviceKey);
  try {
    await requireLeagueManager(admin, data.user);
  } catch {
    return NextResponse.json({ error: "League management access is required." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.requestId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.requestId)) {
    return NextResponse.json({ error: "Invalid fixture date request." }, { status: 400 });
  }
  return NextResponse.json(await emailFixtureCaptains(admin, body.requestId, data.user.id));
}
