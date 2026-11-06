import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveServerRole } from "@/lib/server-role";
import { canManageLeagueRole } from "@/lib/app-roles";
import { canManageFriendly, ukToday, validateFrames, validateOffer, type Friendly } from "@/lib/friendlies";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const columns = "id,host_team_id,guest_team_id,match_date,start_time,venue,notes,status,frames,version";
class RequestError extends Error { constructor(message: string, public status = 400) { super(message); } }
async function context(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !anon) throw new Error("Missing server configuration");
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new RequestError("Please sign in.", 401);
  const auth = await createClient(url, anon).auth.getUser(token);
  if (auth.error || !auth.data.user) throw new RequestError("Please sign in again.", 401);
  const admin = createClient(url, key);
  const user = auth.data.user;
  const [app, seasons, teams, role] = await Promise.all([
    admin.from("app_users").select("linked_player_id").eq("id",user.id).maybeSingle(),
    admin.from("league_seasons").select("id,name").eq("is_active",true).eq("is_published",true),
    admin.from("league_teams").select("id,name,season_id").eq("is_active",true),
    resolveServerRole(admin,user),
  ]);
  if (app.error || seasons.error || teams.error) throw new Error("Unable to load team permissions");
  if (!app.data) throw new RequestError("An app account is required.",403);
  const memberships = app.data.linked_player_id ? await admin.from("league_team_members").select("team_id,is_captain,is_vice_captain").eq("player_id",app.data.linked_player_id) : { data: [], error: null };
  if (memberships.error) throw new Error("Unable to check captain permissions");
  const active = new Set((seasons.data ?? []).map(s=>s.id));
  const available = (teams.data ?? []).filter(t=>active.has(t.season_id));
  const manager = canManageLeagueRole(role);
  const managed = new Set((memberships.data ?? []).filter(m=>m.is_captain || m.is_vice_captain).map(m=>m.team_id));
  return {admin,user,teams:available,seasons:seasons.data ?? [],managedIds:available.filter(t=>manager || managed.has(t.id)).map(t=>t.id)};
}
function failure(error: unknown) {
  if (error instanceof RequestError) return NextResponse.json({error:error.message},{status:error.status,headers});
  console.error("Friendly match request failed",error);
  return NextResponse.json({error:"Unable to load or save friendlies. Please try again."},{status:500,headers});
}
export async function GET(req: NextRequest) {
  try {
    const ctx = await context(req);
    const result = await ctx.admin.from("league_friendlies").select(columns).order("match_date",{ascending:false}).limit(500);
    if (result.error) throw result.error;
    return NextResponse.json({teams:ctx.teams,seasons:ctx.seasons,managedIds:ctx.managedIds,friendlies:result.data ?? []},{headers});
  } catch(error) { return failure(error); }
}
export async function POST(req: NextRequest) {
  try {
    const ctx = await context(req);
    const raw = await req.text();
    if (raw.length > 20000) throw new RequestError("This scorecard is too large.");
    let body: Record<string,unknown>;
    try { body = JSON.parse(raw); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(); } catch { throw new RequestError("Invalid request."); }
    const actor = { updated_by:ctx.user.id,updated_at:new Date().toISOString() };
    if (body.action === "offer") {
      if (!ctx.managedIds.includes(String(body.team_id))) throw new RequestError("Only your team's captain or vice-captain can offer a friendly.",403);
      let offer; try { offer = validateOffer(body); } catch(e) { throw new RequestError((e as Error).message); }
      const result = await ctx.admin.from("league_friendlies").insert({...offer,host_team_id:body.team_id,created_by:ctx.user.id,...actor}).select(columns).single();
      if (result.error?.code === "23505") throw new RequestError("Your team already has an open offer on that date.",409);
      if (result.error) throw result.error;
      return NextResponse.json({friendly:result.data},{status:201,headers});
    }
    if (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id) || !Number.isInteger(body.version)) throw new RequestError("Invalid friendly reference.");
    const existing = await ctx.admin.from("league_friendlies").select(columns).eq("id",body.id).maybeSingle();
    if (existing.error) throw existing.error;
    const row = existing.data as Friendly | null;
    if (!row) throw new RequestError("Friendly not found.",404);
    if (row.version !== body.version) throw new RequestError("This friendly has changed. Refresh the board before trying again.",409);
    let patch: Record<string,unknown>;
    if (body.action === "claim") {
      const team = String(body.team_id);
      if (!ctx.managedIds.includes(team)) throw new RequestError("Choose a team you captain.",403);
      if (team === row.host_team_id) throw new RequestError("Choose another team's offer.");
      if (row.status !== 'open' || row.match_date < ukToday()) throw new RequestError("This offer is no longer available.",409);
      if (!ctx.teams.some(t=>t.id===row.host_team_id)) throw new RequestError("The offering team is no longer active.",409);
      patch = {guest_team_id:team,status:'booked'};
    } else {
      if (!canManageFriendly(row,ctx.managedIds)) throw new RequestError("Only the participating teams' captains can change this friendly.",403);
      if (body.action === 'cancel') {
        if (!['open','booked'].includes(row.status)) throw new RequestError("Only an open or arranged friendly can be cancelled.",409);
        patch = {status:'cancelled'};
      } else if (body.action === 'score') {
        if (!['booked','played'].includes(row.status)) throw new RequestError("Arrange the friendly before recording its frames.",409);
        if (row.match_date > ukToday()) throw new RequestError("Results can be recorded from the match date onwards.");
        let frames; try { frames=validateFrames(body.frames); } catch(e) {throw new RequestError((e as Error).message);}
        patch = {frames,status:'played'};
      } else throw new RequestError("Unknown action.");
    }
    // Compare-and-swap protects claims and scorecards from simultaneous/stale edits.
    const saved = await ctx.admin.from("league_friendlies").update({...patch,...actor,version:row.version+1}).eq("id",row.id).eq("version",row.version).select(columns).maybeSingle();
    if (saved.error) throw saved.error;
    if (!saved.data) throw new RequestError("Another captain just updated this friendly. Refresh and try again.",409);
    return NextResponse.json({friendly:saved.data},{headers});
  } catch(error) { return failure(error); }
}
