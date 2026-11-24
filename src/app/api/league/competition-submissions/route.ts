import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { canManageLeagueRole } from "@/lib/app-roles";
import { fetchAllSupabasePages } from "@/lib/supabase-pagination";

const noStore = { "Cache-Control": "no-store" };

type Submission = { team_id: string; submitted_at: string };

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: "Sign in to view team submissions." }, { status: 401, headers: noStore });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: "Team submissions are unavailable." }, { status: 503, headers: noStore });
  }

  try {
    const authClient = createClient(url, anonKey);
    const { data: { user }, error } = await authClient.auth.getUser(token);
    if (error || !user) return NextResponse.json({ error: "Sign in to view team submissions." }, { status: 401, headers: noStore });

    const client = createClient(url, serviceKey);
    const role = await client.from("app_users").select("role").eq("id", user.id).maybeSingle();
    if (role.error) throw role.error;
    if (!canManageLeagueRole(role.data?.role)) {
      return NextResponse.json({ error: "League officer access is required." }, { status: 403, headers: noStore });
    }

    const seasons = await client.from("league_seasons").select("id,name").eq("is_active", true).eq("is_published", true);
    if (seasons.error) throw seasons.error;
    const seasonIds = seasons.data.map((season) => season.id);
    if (!seasonIds.length) return NextResponse.json({ teams: [] }, { headers: noStore });

    const [teams, submissions] = await Promise.all([
      client.from("league_teams").select("id,name,season_id").in("season_id", seasonIds).eq("is_active", true).order("name"),
      fetchAllSupabasePages<Submission>((from, to) => client.from("public_competition_entry_drafts")
        .select("team_id,submitted_at").in("season_id", seasonIds).eq("status", "submitted")
        .not("submitted_at", "is", null).order("submitted_at", { ascending: false }).order("id").range(from, to)),
    ]);
    if (teams.error || submissions.error) throw teams.error ?? submissions.error;

    const byTeam = new Map<string, { submittedAt: string; forms: number }>();
    for (const submission of submissions.data ?? []) {
      const existing = byTeam.get(submission.team_id);
      if (existing) existing.forms += 1;
      else byTeam.set(submission.team_id, { submittedAt: submission.submitted_at, forms: 1 });
    }
    const seasonNames = new Map(seasons.data.map((season) => [season.id, season.name]));
    return NextResponse.json({
      teams: teams.data.map((team) => ({
        id: team.id,
        name: team.name,
        division: seasonNames.get(team.season_id) ?? "",
        submission: byTeam.get(team.id) ?? null,
      })),
    }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Team submissions could not be loaded. Please try again." }, { status: 500, headers: noStore });
  }
}
