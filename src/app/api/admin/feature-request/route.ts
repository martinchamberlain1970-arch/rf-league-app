import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();

const isMissingTableError = (message?: string | null) =>
  (message ?? "").toLowerCase().includes("could not find the table") ||
  (message ?? "").toLowerCase().includes("does not exist");

async function authenticate(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return { error: "Server is not configured.", status: 500 as const };
  }
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { error: "Missing auth token.", status: 401 as const };
  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return { error: "Unauthorized.", status: 401 as const };
  const email = authData.user.email?.trim().toLowerCase() ?? "";
  return {
    userId: authData.user.id,
    isSuper: Boolean(superAdminEmail) && email === superAdminEmail,
  };
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const adminClient = createClient(supabaseUrl as string, serviceRoleKey as string);
  let query = adminClient
    .from("feature_access_requests")
    .select("id,requester_user_id,feature,status,created_at,reviewed_by_user_id,reviewed_at,note")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (!auth.isSuper) query = query.eq("requester_user_id", auth.userId);
  const res = await query;
  if (res.error) {
    if (isMissingTableError(res.error.message)) return NextResponse.json({ requests: [] });
    return NextResponse.json({ error: res.error.message }, { status: 400 });
  }
  return NextResponse.json({ requests: res.data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "").trim() || "submit";
  const adminClient = createClient(supabaseUrl as string, serviceRoleKey as string);

  if (action === "submit") {
    const feature = String(body?.feature ?? "").trim();
    if (feature !== "quick_match" && feature !== "competition_create") {
      return NextResponse.json({ error: "Invalid feature." }, { status: 400 });
    }
    if (auth.isSuper) {
      return NextResponse.json({ error: "Super User does not need to request access." }, { status: 400 });
    }

    const appUser = await adminClient.from("app_users").select("id,role").eq("id", auth.userId).maybeSingle();
    const role = (appUser.data as { role?: string | null } | null)?.role ?? "user";
    if (role !== "admin") {
      return NextResponse.json({ error: "Only admins can request this access." }, { status: 403 });
    }

    const existing = await adminClient
      .from("feature_access_requests")
      .select("id")
      .eq("requester_user_id", auth.userId)
      .eq("feature", feature)
      .eq("status", "pending")
      .limit(1);
    if (!existing.error && (existing.data?.length ?? 0) > 0) {
      return NextResponse.json({ error: "Request already pending." }, { status: 400 });
    }

    const ins = await adminClient.from("feature_access_requests").insert({
      requester_user_id: auth.userId,
      feature,
      status: "pending",
      note: null,
    });
    if (ins.error) {
      if (isMissingTableError(ins.error.message)) {
        return NextResponse.json({ error: "Feature request table is missing. Run latest SQL migration." }, { status: 400 });
      }
      return NextResponse.json({ error: ins.error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "review") {
    if (!auth.isSuper) return NextResponse.json({ error: "Only Super User can review requests." }, { status: 403 });
    const requestId = String(body?.requestId ?? "").trim();
    const approve = Boolean(body?.approve);
    if (!requestId) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

    const reqRow = await adminClient
      .from("feature_access_requests")
      .select("id,requester_user_id,feature,status")
      .eq("id", requestId)
      .maybeSingle();
    if (reqRow.error || !reqRow.data) return NextResponse.json({ error: "Request not found." }, { status: 404 });
    if ((reqRow.data as { status?: string }).status !== "pending") {
      return NextResponse.json({ error: "Request is already processed." }, { status: 400 });
    }

    const row = reqRow.data as { requester_user_id: string; feature: "quick_match" | "competition_create" };
    if (approve) {
      const col = row.feature === "quick_match" ? "quick_match_enabled" : "competition_create_enabled";
      const upd = await adminClient.from("app_users").update({ [col]: true }).eq("id", row.requester_user_id);
      if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 400 });
    }

    const review = await adminClient
      .from("feature_access_requests")
      .update({
        status: approve ? "approved" : "rejected",
        reviewed_by_user_id: auth.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("status", "pending");
    if (review.error) return NextResponse.json({ error: review.error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}

