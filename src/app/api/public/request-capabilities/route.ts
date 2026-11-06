import { NextResponse } from "next/server";
import { publicJson } from "@/lib/public-response";

// Return only optional-feature availability, never the schema or service credentials.
const optionalTables = ["admin_requests", "profile_merge_requests", "player_deletion_requests"];
export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Server configuration missing");
    const response = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/openapi+json" },
      next: { revalidate: 300 },
    });
    if (!response.ok) throw new Error(`Schema discovery failed (${response.status})`);
    const schema = await response.json();
    if (!schema.paths || typeof schema.paths !== "object") throw new Error("Schema discovery returned no paths");
    return publicJson(Object.fromEntries(optionalTables.map(table => [table, Boolean(schema.paths[`/${table}`])])), undefined, 300);
  } catch (error) {
    console.error("Request capability discovery failed", error);
    return NextResponse.json({ error: "Unable to check optional request features" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
