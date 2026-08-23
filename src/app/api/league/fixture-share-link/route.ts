import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireLeagueManager } from "@/lib/server-role";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const noStore = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export async function GET(req: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) throw new Error("SERVER_NOT_CONFIGURED");
    const accessToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) throw new Error("UNAUTHORIZED");
    const seasonId = req.nextUrl.searchParams.get("seasonId")?.trim() ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(seasonId)) throw new Error("Select a valid league season.");

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const authRes = await authClient.auth.getUser(accessToken);
    if (authRes.error || !authRes.data.user) throw new Error("UNAUTHORIZED");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    await requireLeagueManager(adminClient, authRes.data.user);
    const seasonRes = await adminClient
      .from("league_seasons")
      .select("id,name,is_published")
      .eq("id", seasonId)
      .maybeSingle();

    if (seasonRes.error) throw new Error(seasonRes.error.message);
    if (!seasonRes.data) throw new Error("League season not found.");

    const query = new URLSearchParams({ seasonId });
    if (!seasonRes.data.is_published) {
      let linkRes = await adminClient
        .from("league_fixture_draft_links")
        .select("share_token")
        .eq("season_id", seasonId)
        .maybeSingle();
      if (!linkRes.error && !linkRes.data) {
        linkRes = await adminClient
          .from("league_fixture_draft_links")
          .insert({ season_id: seasonId })
          .select("share_token")
          .single();
      }
      if (linkRes.error) {
        const migrationMissing = /league_fixture_draft_links|schema cache|does not exist/i.test(linkRes.error.message);
        throw new Error(migrationMissing
          ? "The private fixture-link database update has not been installed yet. Run the latest Supabase migration, then try again."
          : linkRes.error.message);
      }
      query.set("draft", String(linkRes.data?.share_token));
    }

    return NextResponse.json({
      sharePath: `/display/fixtures?${query.toString()}`,
      mode: seasonRes.data.is_published ? "published" : "draft",
      seasonName: seasonRes.data.name,
    }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The fixture share link could not be prepared.";
    if (message === "SERVER_NOT_CONFIGURED") return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers: noStore });
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: noStore });
    if (message === "FORBIDDEN_LEAGUE_MANAGER") return NextResponse.json({ error: "League Secretary, Chairman or Treasurer access is required." }, { status: 403, headers: noStore });
    return NextResponse.json({ error: message }, { status: 400, headers: noStore });
  }
}
