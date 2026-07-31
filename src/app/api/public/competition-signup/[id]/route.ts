import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  const client = createClient(supabaseUrl, serviceRoleKey);
  const result = await client
    .from("competitions")
    .select("id,name,venue,sport_type,competition_format,match_mode,signup_open,signup_deadline,max_entries,is_archived,is_completed")
    .eq("id", id)
    .maybeSingle();

  if (result.error || !result.data || result.data.is_archived) {
    return NextResponse.json({ error: "Competition not found." }, { status: 404 });
  }

  return NextResponse.json({ competition: result.data });
}
