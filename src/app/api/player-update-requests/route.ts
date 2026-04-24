import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL?.trim().toLowerCase() ?? process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ?? "";

type UpdateRow = {
  id: string;
  player_id: string;
  requester_user_id: string;
  requested_full_name: string | null;
  requested_location_id: string | null;
  requested_avatar_url?: string | null;
  requested_age_band?: string | null;
  requested_guardian_consent?: boolean | null;
  requested_guardian_name?: string | null;
  requested_guardian_email?: string | null;
  requested_guardian_user_id?: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

function isMissingColumnError(message?: string | null) {
  const text = (message ?? "").toLowerCase();
  return text.includes("column") && (text.includes("does not exist") || text.includes("schema cache"));
}

export async function GET(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Missing auth token." }, { status: 401 });

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const requesterId = authData.user.id;
  const requesterEmail = authData.user.email?.trim().toLowerCase() ?? "";
  const mode = req.nextUrl.searchParams.get("mode") === "mine" ? "mine" : "approvals";

  const appUserRes = await serviceClient
    .from("app_users")
    .select("id,role,linked_player_id")
    .eq("id", requesterId)
    .maybeSingle();
  if (appUserRes.error || !appUserRes.data) {
    return NextResponse.json({ error: "User account record not found." }, { status: 400 });
  }

  const appUser = appUserRes.data as { id: string; role: string | null; linked_player_id: string | null };
  const role = String(appUser.role ?? "").toLowerCase();
  const isSuper = Boolean(superAdminEmail && requesterEmail === superAdminEmail) || role === "owner" || role === "super";
  const isAdmin = isSuper || role === "admin";

  if (mode === "approvals" && !isAdmin) {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  }

  const buildQuery = (selectClause: string) => {
    let query = serviceClient
      .from("player_update_requests")
      .select(selectClause)
      .order("created_at", { ascending: false });
    if (mode === "mine") {
      query = query.eq("requester_user_id", requesterId).in("status", ["pending", "approved", "rejected"]);
    } else {
      query = query.eq("status", "pending");
    }
    return query;
  };

  const fullRes = await buildQuery(
    "id,player_id,requester_user_id,requested_full_name,requested_location_id,requested_avatar_url,requested_age_band,requested_guardian_consent,requested_guardian_name,requested_guardian_email,requested_guardian_user_id,status,created_at"
  );

  let rows: UpdateRow[] = [];
  if (!fullRes.error && fullRes.data) {
    rows = fullRes.data as UpdateRow[];
  } else if (isMissingColumnError(fullRes.error?.message)) {
    const fallbackRes = await buildQuery(
      "id,player_id,requester_user_id,requested_full_name,requested_location_id,requested_avatar_url,status,created_at"
    );
    if (fallbackRes.error || !fallbackRes.data) {
      return NextResponse.json({ error: fallbackRes.error?.message ?? "Failed to load update requests." }, { status: 400 });
    }
    rows = (fallbackRes.data as Array<Omit<UpdateRow, "requested_age_band" | "requested_guardian_consent" | "requested_guardian_name" | "requested_guardian_email" | "requested_guardian_user_id">>).map((row) => ({
      ...row,
      requested_age_band: null,
      requested_guardian_consent: null,
      requested_guardian_name: null,
      requested_guardian_email: null,
      requested_guardian_user_id: null,
    }));
  } else if (fullRes.error) {
    return NextResponse.json({ error: fullRes.error.message }, { status: 400 });
  }

  if (mode === "approvals" && !isSuper) {
    const linkedPlayerId = appUser.linked_player_id;
    if (!linkedPlayerId) {
      return NextResponse.json({ requests: rows, count: rows.length });
    }
    const adminPlayerRes = await serviceClient.from("players").select("location_id").eq("id", linkedPlayerId).maybeSingle();
    const adminLocationId = (adminPlayerRes.data?.location_id as string | null) ?? null;
    if (!adminLocationId) {
      return NextResponse.json({ requests: rows, count: rows.length });
    }

    const requesterUserIds = Array.from(new Set(rows.map((row) => row.requester_user_id).filter(Boolean)));
    if (!requesterUserIds.length) {
      return NextResponse.json({ requests: [], count: 0 });
    }
    const requesterPlayersRes = await serviceClient
      .from("players")
      .select("claimed_by,location_id")
      .in("claimed_by", requesterUserIds);
    const requesterLocationByUser = new Map<string, string | null>();
    (requesterPlayersRes.data ?? []).forEach((row: { claimed_by: string | null; location_id: string | null }) => {
      if (row.claimed_by) requesterLocationByUser.set(row.claimed_by, row.location_id ?? null);
    });
    rows = rows.filter((row) => requesterLocationByUser.get(row.requester_user_id) === adminLocationId);
  }

  return NextResponse.json({ requests: rows, count: rows.length });
}
