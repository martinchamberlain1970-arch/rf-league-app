import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isMissingTableError(message?: string | null) {
  const lower = (message ?? "").toLowerCase();
  return lower.includes("does not exist") || lower.includes("could not find the table");
}

export async function GET() {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server configuration missing." }, { status: 500 });
  }

  const client = createClient(supabaseUrl, serviceRoleKey);
  const res = await client
    .from("site_announcements")
    .select("id,title,body,is_active,updated_at")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (res.error) {
    if (isMissingTableError(res.error.message)) {
      return NextResponse.json({ announcement: null });
    }
    return NextResponse.json({ error: res.error.message }, { status: 500 });
  }

  return NextResponse.json({ announcement: res.data ?? null });
}
