import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

type AppUserRow = {
  id: string;
  role: string | null;
  linked_player_id: string | null;
};

function isMissingColumnError(message?: string | null) {
  const text = (message ?? "").toLowerCase();
  return text.includes("column") && (text.includes("does not exist") || text.includes("schema cache"));
}

async function loadActor(serviceClient: any, requesterId: string, requesterEmail: string) {
  const appUserRes = await serviceClient
    .from("app_users")
    .select("id,role,linked_player_id")
    .eq("id", requesterId)
    .maybeSingle();
  if (appUserRes.error || !appUserRes.data) {
    return { error: "User account record not found." as const };
  }

  const appUser = appUserRes.data as AppUserRow;
  const role = String(appUser.role ?? "").toLowerCase();
  const isSuper = Boolean(superAdminEmail && requesterEmail === superAdminEmail) || role === "owner" || role === "super";
  const isAdmin = isSuper || role === "admin";
  return { appUser, role, isSuper, isAdmin } as const;
}

async function loadRequestForAction(serviceClient: any, requestId: string) {
  const fullRes = await serviceClient
    .from("player_update_requests")
    .select("id,player_id,requester_user_id,requested_full_name,requested_location_id,requested_avatar_url,requested_age_band,requested_guardian_consent,requested_guardian_name,requested_guardian_email,requested_guardian_user_id,status,created_at")
    .eq("id", requestId)
    .maybeSingle();
  if (!fullRes.error && fullRes.data) {
    return { row: fullRes.data as unknown as UpdateRow, error: null };
  }
  if (!isMissingColumnError(fullRes.error?.message)) {
    return { row: null, error: fullRes.error?.message ?? "Failed to load update request." };
  }
  const fallbackRes = await serviceClient
    .from("player_update_requests")
    .select("id,player_id,requester_user_id,requested_full_name,requested_location_id,requested_avatar_url,status,created_at")
    .eq("id", requestId)
    .maybeSingle();
  if (fallbackRes.error || !fallbackRes.data) {
    return { row: null, error: fallbackRes.error?.message ?? "Failed to load update request." };
  }
  return {
    row: {
      ...(fallbackRes.data as unknown as Omit<UpdateRow, "requested_age_band" | "requested_guardian_consent" | "requested_guardian_name" | "requested_guardian_email" | "requested_guardian_user_id">),
      requested_age_band: null,
      requested_guardian_consent: null,
      requested_guardian_name: null,
      requested_guardian_email: null,
      requested_guardian_user_id: null,
    } as UpdateRow,
    error: null,
  };
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

  const actor = await loadActor(serviceClient, requesterId, requesterEmail);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: 400 });
  }
  const { appUser, isSuper, isAdmin } = actor;

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
    rows = fullRes.data as unknown as UpdateRow[];
  } else if (isMissingColumnError(fullRes.error?.message)) {
    const fallbackRes = await buildQuery(
      "id,player_id,requester_user_id,requested_full_name,requested_location_id,requested_avatar_url,status,created_at"
    );
    if (fallbackRes.error || !fallbackRes.data) {
      return NextResponse.json({ error: fallbackRes.error?.message ?? "Failed to load update requests." }, { status: 400 });
    }
    rows = ((fallbackRes.data as unknown) as Array<Omit<UpdateRow, "requested_age_band" | "requested_guardian_consent" | "requested_guardian_name" | "requested_guardian_email" | "requested_guardian_user_id">>).map((row) => ({
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
      return NextResponse.json({ requests: rows, count: rows.length }, { headers: { "Cache-Control": "no-store" } });
    }
    const adminPlayerRes = await serviceClient.from("players").select("location_id").eq("id", linkedPlayerId).maybeSingle();
    const adminLocationId = (adminPlayerRes.data?.location_id as string | null) ?? null;
    if (!adminLocationId) {
      return NextResponse.json({ requests: rows, count: rows.length }, { headers: { "Cache-Control": "no-store" } });
    }

    const requesterUserIds = Array.from(new Set(rows.map((row) => row.requester_user_id).filter(Boolean)));
    if (!requesterUserIds.length) {
      return NextResponse.json({ requests: [], count: 0 }, { headers: { "Cache-Control": "no-store" } });
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

  return NextResponse.json({ requests: rows, count: rows.length }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
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

  const body = await req.json().catch(() => null);
  const requestId = String(body?.requestId ?? "").trim();
  const action = String(body?.action ?? "").trim().toLowerCase();
  if (!requestId || !["approve", "reject", "delete"].includes(action)) {
    return NextResponse.json({ error: "Valid requestId and action are required." }, { status: 400 });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const requesterId = authData.user.id;
  const requesterEmail = authData.user.email?.trim().toLowerCase() ?? "";
  const actor = await loadActor(serviceClient, requesterId, requesterEmail);
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: 400 });
  }
  const { isSuper } = actor;
  if (!isSuper) {
    return NextResponse.json({ error: "Only the Super User can review profile/photo updates." }, { status: 403 });
  }

  const requestLoad = await loadRequestForAction(serviceClient, requestId);
  if (requestLoad.error || !requestLoad.row) {
    return NextResponse.json({ error: requestLoad.error ?? "Update request not found." }, { status: 404 });
  }
  const row = requestLoad.row;

  if (action === "delete") {
    const deleteRes = await serviceClient.from("player_update_requests").delete().eq("id", requestId);
    if (deleteRes.error) {
      return NextResponse.json({ error: deleteRes.error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "approve") {
    const updatePayload: Record<string, string | boolean | null> = {};
    if (row.requested_full_name !== null && row.requested_full_name !== undefined) {
      updatePayload.full_name = row.requested_full_name;
    }
    if (row.requested_age_band) {
      updatePayload.age_band = row.requested_age_band;
      if (row.requested_age_band !== "18_plus") {
        const firstOnly = (row.requested_full_name ?? "").split(/\s+/).filter(Boolean)[0];
        if (firstOnly) updatePayload.display_name = firstOnly;
        updatePayload.avatar_url = null;
        updatePayload.guardian_consent = Boolean(row.requested_guardian_consent);
        if (row.requested_guardian_name) updatePayload.guardian_name = row.requested_guardian_name;
        if (row.requested_guardian_email) updatePayload.guardian_email = row.requested_guardian_email;
        if (row.requested_guardian_user_id) updatePayload.guardian_user_id = row.requested_guardian_user_id;
      }
    }
    if (row.requested_location_id !== undefined) {
      updatePayload.location_id = row.requested_location_id;
    }
    if (row.requested_avatar_url && (row.requested_age_band ?? "18_plus") === "18_plus") {
      updatePayload.avatar_url = row.requested_avatar_url;
    }
    if (Object.keys(updatePayload).length) {
      const playerRes = await serviceClient.from("players").update(updatePayload).eq("id", row.player_id);
      if (playerRes.error) {
        return NextResponse.json({ error: playerRes.error.message }, { status: 400 });
      }
    }
  }

  const requestRes = await serviceClient
    .from("player_update_requests")
    .update({
      status: action === "approve" ? "approved" : "rejected",
      reviewed_by_user_id: requesterId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "pending");
  if (requestRes.error) {
    return NextResponse.json({ error: requestRes.error.message }, { status: 400 });
  }

  if (row.requested_avatar_url) {
    await serviceClient
      .from("player_update_requests")
      .update({
        status: action === "approve" ? "approved" : "rejected",
        reviewed_by_user_id: requesterId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("status", "pending")
      .eq("player_id", row.player_id)
      .eq("requester_user_id", row.requester_user_id)
      .eq("requested_avatar_url", row.requested_avatar_url);
  }

  return NextResponse.json({ ok: true });
}
