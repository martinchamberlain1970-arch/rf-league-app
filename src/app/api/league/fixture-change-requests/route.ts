import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { canManageLeagueRole } from "@/lib/app-roles";
import { fetchAllSupabasePages, fetchAllSupabasePagesByChunks } from "@/lib/supabase-pagination";
import { resolveServerRole } from "@/lib/server-role";
import { sendPushToLeagueManagers } from "@/lib/push-server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ?? "";

function isMissingTableError(message?: string | null) {
  const m = (message ?? "").toLowerCase();
  return m.includes("could not find the table") || m.includes("does not exist");
}

type RoleMembership = {
  team_id: string;
  player_id: string;
  is_captain: boolean;
  is_vice_captain: boolean;
};

type FixtureRow = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  fixture_date: string | null;
  status: "pending" | "in_progress" | "complete";
};

function parseDateOnly(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function requireEnv() {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }
  return null;
}

async function authenticate(req: NextRequest) {
  const envError = requireEnv();
  if (envError) return { error: envError };
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { error: NextResponse.json({ error: "Missing auth token." }, { status: 401 }) };
  const authClient = createClient(supabaseUrl!, supabaseAnonKey!);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  return { user: data.user };
}

const requestColumns = "id,fixture_id,requested_by_user_id,requester_team_id,request_type,original_fixture_date,proposed_fixture_date,agreed_fixture_date,opposing_team_agreed,reason,status,review_notes,reviewed_by_user_id,reviewed_at,created_at";

async function getApprovalRows(client: SupabaseClient, fixtureId: string) {
  const requests = await fetchAllSupabasePages<{ fixture_id: string; requested_by_user_id: string; requester_team_id: string | null }>((from, to) => {
    const query = client.from("league_fixture_change_requests").select(requestColumns);
    const filtered = fixtureId ? query.eq("fixture_id", fixtureId) : query;
    return filtered.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to);
  });
  if (requests.error) return NextResponse.json({ error: requests.error.message }, { status: 500 });
  const rows = requests.data ?? [];
  const fixtureIds = Array.from(new Set(rows.map((row) => row.fixture_id)));
  const requesterIds = Array.from(new Set(rows.map((row) => row.requested_by_user_id).filter(Boolean)));
  const [fixtures, requesters] = await Promise.all([
    fetchAllSupabasePagesByChunks<Pick<FixtureRow, "id" | "home_team_id" | "away_team_id"> & { season_id: string }, string>(fixtureIds, (ids, from, to) => client.from("league_fixtures")
      .select("id,home_team_id,away_team_id,season_id").in("id", ids).order("id").range(from, to)),
    fetchAllSupabasePagesByChunks<{ id: string; linked_player_id: string | null }, string>(requesterIds, (ids, from, to) => client.from("app_users")
      .select("id,linked_player_id").in("id", ids).order("id").range(from, to)),
  ]);
  const fixtureRows = fixtures.data ?? [];
  const teamIds = Array.from(new Set([...fixtureRows.flatMap((row) => [row.home_team_id, row.away_team_id]), ...rows.map((row) => row.requester_team_id)].filter((id): id is string => Boolean(id))));
  const seasonIds = Array.from(new Set(fixtureRows.map((row) => row.season_id)));
  const playerIds = Array.from(new Set((requesters.data ?? []).map((row) => row.linked_player_id).filter((id): id is string => Boolean(id))));
  const [teams, seasons, players] = await Promise.all([
    fetchAllSupabasePagesByChunks<{ id: string; name: string }, string>(teamIds, (ids, from, to) => client.from("league_teams").select("id,name").in("id", ids).order("id").range(from, to)),
    fetchAllSupabasePagesByChunks<{ id: string; name: string }, string>(seasonIds, (ids, from, to) => client.from("league_seasons").select("id,name").in("id", ids).order("id").range(from, to)),
    fetchAllSupabasePagesByChunks<{ id: string; full_name: string | null; display_name: string | null }, string>(playerIds, (ids, from, to) => client.from("players").select("id,full_name,display_name").in("id", ids).order("id").range(from, to)),
  ]);
  const error = fixtures.error ?? requesters.error ?? teams.error ?? seasons.error ?? players.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const fixtureById = new Map(fixtureRows.map((row) => [row.id, row]));
  const requesterById = new Map((requesters.data ?? []).map((row) => [row.id, row.linked_player_id]));
  const playerById = new Map((players.data ?? []).map((row) => [row.id, row]));
  const teamById = new Map((teams.data ?? []).map((row) => [row.id, row.name]));
  const seasonById = new Map((seasons.data ?? []).map((row) => [row.id, row.name]));

  return NextResponse.json({ rows: rows.map((row) => {
    const fixture = fixtureById.get(row.fixture_id);
    const playerId = requesterById.get(row.requested_by_user_id);
    const player = playerId ? playerById.get(playerId) : undefined;
    return {
      ...row,
      home_team_name: teamById.get(fixture?.home_team_id ?? "") ?? null,
      away_team_name: teamById.get(fixture?.away_team_id ?? "") ?? null,
      season_name: seasonById.get(fixture?.season_id ?? "") ?? null,
      requester_name: player?.full_name?.trim() || player?.display_name || null,
      requester_team_name: teamById.get(row.requester_team_id ?? "") ?? null,
    };
  }) });
}

async function getCaptainInbox(client: SupabaseClient, userId: string) {
  const account = await client.from("app_users").select("linked_player_id").eq("id", userId).maybeSingle();
  if (account.error) return NextResponse.json({ error: "Could not load the team notification inbox." }, { status: 500 });
  if (!account.data?.linked_player_id) return NextResponse.json({ rows: [] });

  const roster = await client.from("league_team_members").select("team_id")
    .eq("player_id", account.data.linked_player_id).or("is_captain.eq.true,is_vice_captain.eq.true");
  if (roster.error) return NextResponse.json({ error: "Could not load the team notification inbox." }, { status: 500 });
  const teamIds = [...new Set(roster.data.map((row) => row.team_id))];
  if (!teamIds.length) return NextResponse.json({ rows: [] });

  type InboxFixture = { id: string; home_team_id: string; away_team_id: string; fixture_date: string };
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const fixtures = await fetchAllSupabasePagesByChunks<InboxFixture, string>(teamIds, (ids, from, to) =>
    client.from("league_fixtures").select("id,home_team_id,away_team_id,fixture_date,league_seasons!inner(is_published)")
      .eq("league_seasons.is_published", true)
      .or(`home_team_id.in.(${ids.join(",")}),away_team_id.in.(${ids.join(",")})`)
      .gte("fixture_date", cutoff).neq("status", "bye").order("id").range(from, to)
  );
  if (fixtures.error) return NextResponse.json({ error: "Could not load the team notification inbox." }, { status: 500 });
  const fixtureById = new Map((fixtures.data ?? []).map((fixture) => [fixture.id, fixture]));
  const requests = await fetchAllSupabasePagesByChunks<{
    id: string; fixture_id: string; agreed_fixture_date: string; reviewed_at: string | null; created_at: string;
  }, string>([...fixtureById.keys()], (ids, from, to) =>
    client.from("league_fixture_change_requests").select("id,fixture_id,agreed_fixture_date,reviewed_at,created_at")
      .in("fixture_id", ids).eq("status", "rescheduled").order("id").range(from, to)
  );
  if (requests.error) return NextResponse.json({ error: "Could not load the team notification inbox." }, { status: 500 });
  const latest = new Map<string, NonNullable<typeof requests.data>[number]>();
  for (const request of requests.data ?? []) {
    if (fixtureById.get(request.fixture_id)?.fixture_date !== request.agreed_fixture_date) continue;
    const previous = latest.get(request.fixture_id);
    if (!previous || (previous.reviewed_at ?? previous.created_at) < (request.reviewed_at ?? request.created_at)) latest.set(request.fixture_id, request);
  }
  const matched = [...latest.values()].flatMap((request) => {
    const fixture = fixtureById.get(request.fixture_id);
    return fixture ? [{ request, fixture }] : [];
  });
  const matchTeamIds = [...new Set(matched.flatMap(({ fixture }) => [fixture.home_team_id, fixture.away_team_id]))];
  const teams = await fetchAllSupabasePagesByChunks<{ id: string; name: string }, string>(matchTeamIds, (ids, from, to) =>
    client.from("league_teams").select("id,name").in("id", ids).order("id").range(from, to)
  );
  if (teams.error) return NextResponse.json({ error: "Could not load the team notification inbox." }, { status: 500 });
  const names = new Map((teams.data ?? []).map((team) => [team.id, team.name]));
  const dateFormat = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
  return NextResponse.json({ rows: matched.map(({ request, fixture }) => ({
    key: `fixture_date_confirmed:${request.id}:${request.agreed_fixture_date}`,
    title: "Fixture date confirmed",
    detail: `${names.get(fixture.home_team_id) ?? "Home team"} vs ${names.get(fixture.away_team_id) ?? "Away team"} will be played on ${dateFormat.format(new Date(`${request.agreed_fixture_date}T12:00:00Z`))}.`,
    created_at: request.reviewed_at ?? request.created_at,
    href: "/captain-results",
    status: "approved",
  })) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const adminClient = createClient(supabaseUrl!, serviceRoleKey!);
  const userId = auth.user.id;
  const userEmail = auth.user.email?.trim().toLowerCase() ?? "";
  const isSuper = !!superAdminEmail && userEmail === superAdminEmail;
  const scope = req.nextUrl.searchParams.get("scope") ?? "mine";
  const fixtureId = req.nextUrl.searchParams.get("fixtureId") ?? "";
  if (scope === "captain_inbox") return getCaptainInbox(adminClient, userId);

  let query = adminClient
    .from("league_fixture_change_requests")
    .select(requestColumns)
    .order("created_at", { ascending: false });

  if (fixtureId) query = query.eq("fixture_id", fixtureId);

  if (scope === "admin") {
    const role = await resolveServerRole(adminClient, auth.user);
    if (!isSuper && !canManageLeagueRole(role)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (req.nextUrl.searchParams.get("view") === "approvals") return getApprovalRows(adminClient, fixtureId);
  } else if (scope === "published") {
    const publishedSeasonsRes = await adminClient
      .from("league_seasons")
      .select("id")
      .eq("is_published", true);
    if (publishedSeasonsRes.error) {
      return NextResponse.json({ error: publishedSeasonsRes.error.message }, { status: 400 });
    }
    const seasonIds = (publishedSeasonsRes.data ?? []).map((row: { id: string }) => row.id);
    if (seasonIds.length === 0) return NextResponse.json({ rows: [] });
    const fixtureRes = await adminClient
      .from("league_fixtures")
      .select("id")
      .in("season_id", seasonIds);
    if (fixtureRes.error) {
      return NextResponse.json({ error: fixtureRes.error.message }, { status: 400 });
    }
    const ids = (fixtureRes.data ?? []).map((row: { id: string }) => row.id);
    if (ids.length === 0) return NextResponse.json({ rows: [] });
    query = query.in("fixture_id", ids);
  } else {
    const appUserRes = await adminClient.from("app_users").select("linked_player_id").eq("id", userId).maybeSingle();
    const linkedPlayerId = (appUserRes.data?.linked_player_id as string | null) ?? null;
    if (!linkedPlayerId) return NextResponse.json({ rows: [] });

    const membershipRes = await adminClient
      .from("league_team_members")
      .select("team_id,player_id,is_captain,is_vice_captain")
      .eq("player_id", linkedPlayerId);
    if (membershipRes.error) return NextResponse.json({ error: membershipRes.error.message }, { status: 400 });

    const teamIds = new Set(
      ((membershipRes.data ?? []) as RoleMembership[]).map((m) => m.team_id)
    );
    if (teamIds.size === 0) return NextResponse.json({ rows: [] });

    const orClause = Array.from(teamIds).map((id) => `home_team_id.eq.${id},away_team_id.eq.${id}`).join(",");
    const fixtureRes = await adminClient.from("league_fixtures").select("id,home_team_id,away_team_id").or(orClause);
    if (fixtureRes.error) return NextResponse.json({ error: fixtureRes.error.message }, { status: 400 });

    const allowedFixtureIds = new Set((fixtureRes.data ?? []).map((r: { id: string }) => r.id));
    if (fixtureId && !allowedFixtureIds.has(fixtureId)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const ids = fixtureId ? [fixtureId] : Array.from(allowedFixtureIds);
    if (ids.length === 0) return NextResponse.json({ rows: [] });
    query = query.in("fixture_id", ids);
  }

  const res = await query;
  if (res.error) {
    if (isMissingTableError(res.error.message)) return NextResponse.json({ rows: [] });
    return NextResponse.json({ error: res.error.message }, { status: 400 });
  }
  return NextResponse.json({ rows: res.data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const adminClient = createClient(supabaseUrl!, serviceRoleKey!);
  const userId = auth.user.id;

  const appUserRes = await adminClient.from("app_users").select("linked_player_id").eq("id", userId).maybeSingle();
  const linkedPlayerId = (appUserRes.data?.linked_player_id as string | null) ?? null;
  if (!linkedPlayerId) return NextResponse.json({ error: "Your account is not linked to a player." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const fixtureId = typeof body?.fixtureId === "string" ? body.fixtureId : "";
  const requestType = body?.requestType === "play_early" || body?.requestType === "play_late" ? body.requestType : null;
  const proposedFixtureDate = typeof body?.proposedFixtureDate === "string" ? body.proposedFixtureDate : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const opposingTeamAgreed = Boolean(body?.opposingTeamAgreed);

  if (!fixtureId || !requestType || !reason) {
    return NextResponse.json({ error: "Missing request details." }, { status: 400 });
  }

  const membershipRes = await adminClient
    .from("league_team_members")
    .select("team_id,player_id,is_captain,is_vice_captain")
    .eq("player_id", linkedPlayerId);
  if (membershipRes.error) return NextResponse.json({ error: membershipRes.error.message }, { status: 400 });
  const captainMemberships = ((membershipRes.data ?? []) as RoleMembership[]).filter((m) => m.is_captain || Boolean(m.is_vice_captain));
  if (!captainMemberships.length) {
    return NextResponse.json({ error: "Only captains or vice-captains can request fixture date changes." }, { status: 403 });
  }

  const fixtureRes = await adminClient
    .from("league_fixtures")
    .select("id,home_team_id,away_team_id,fixture_date,status")
    .eq("id", fixtureId)
    .maybeSingle();
  if (fixtureRes.error || !fixtureRes.data) {
    return NextResponse.json({ error: fixtureRes.error?.message ?? "Fixture not found." }, { status: 404 });
  }
  const fixture = fixtureRes.data as FixtureRow;
  if (fixture.status === "complete") {
    return NextResponse.json({ error: "Completed fixtures cannot be changed." }, { status: 400 });
  }
  const captainTeamIds = new Set(captainMemberships.map((m) => m.team_id));
  const requesterTeamId = captainTeamIds.has(fixture.home_team_id) ? fixture.home_team_id : captainTeamIds.has(fixture.away_team_id) ? fixture.away_team_id : null;
  if (!requesterTeamId) {
    return NextResponse.json({ error: "You can only request changes for your own team fixtures." }, { status: 403 });
  }
  if (!fixture.fixture_date) {
    return NextResponse.json({ error: "This fixture does not currently have a league date." }, { status: 400 });
  }
  if (requestType === "play_early" && !opposingTeamAgreed) {
    return NextResponse.json({ error: "Play-before requests require confirmation that the opposing team agrees." }, { status: 400 });
  }
  if (requestType === "play_early") {
    const fixtureDate = parseDateOnly(fixture.fixture_date);
    const proposedDate = parseDateOnly(proposedFixtureDate);
    if (!fixtureDate || !proposedDate) {
      return NextResponse.json({ error: "Choose the agreed early-play date." }, { status: 400 });
    }
    const diffDays = Math.round((fixtureDate.getTime() - proposedDate.getTime()) / 86400000);
    if (diffDays < 1 || diffDays > 3) {
      return NextResponse.json({ error: "Play-before requests must use a date in the 3 days before the league fixture." }, { status: 400 });
    }
  }

  const pendingRes = await adminClient
    .from("league_fixture_change_requests")
    .select("id")
    .eq("fixture_id", fixtureId)
    .in("status", ["pending", "approved_outstanding"])
    .limit(1);
  if (pendingRes.error) {
    if (isMissingTableError(pendingRes.error.message)) {
      return NextResponse.json({ error: "Fixture date requests are not available until the latest database migration has been run." }, { status: 400 });
    }
    return NextResponse.json({ error: pendingRes.error.message }, { status: 400 });
  }
  if ((pendingRes.data ?? []).length) {
    return NextResponse.json({ error: "A fixture date request is already active for this fixture." }, { status: 400 });
  }

  const ins = await adminClient.from("league_fixture_change_requests").insert({
    fixture_id: fixtureId,
    requested_by_user_id: userId,
    requester_team_id: requesterTeamId,
    request_type: requestType,
    original_fixture_date: fixture.fixture_date,
    proposed_fixture_date: requestType === "play_early" ? proposedFixtureDate : null,
    opposing_team_agreed: opposingTeamAgreed,
    reason,
    status: "pending",
  });
  if (ins.error) {
    if (isMissingTableError(ins.error.message)) {
      return NextResponse.json({ error: "Fixture date requests are not available until the latest database migration has been run." }, { status: 400 });
    }
    return NextResponse.json({ error: ins.error.message }, { status: 400 });
  }

  await sendPushToLeagueManagers(adminClient, {
    title: "Fixture date request awaiting approval",
    body: requestType === "play_early" ? "A captain has requested an agreed early fixture date." : "A captain has submitted an exceptional postponement request.",
    url: "/results",
    tag: `fixture-change-${fixtureId}`,
  }, [userId]);

  return NextResponse.json({ ok: true });
}
