import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DOCUMENT_BUCKET = "league-documents";

async function requireSuperUser(token: string) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return { error: NextResponse.json({ error: "Server is not configured." }, { status: 500 }) };
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const appUserRes = await adminClient.from("app_users").select("id,role").eq("id", authData.user.id).maybeSingle();
  if (appUserRes.error || !appUserRes.data) {
    return { error: NextResponse.json({ error: "User account record not found." }, { status: 400 }) };
  }

  const role = String((appUserRes.data as { role: string | null }).role ?? "").toLowerCase();
  if (role !== "super" && role !== "owner") {
    return { error: NextResponse.json({ error: "Only the Super User can manage documents." }, { status: 403 }) };
  }

  return { adminClient };
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const token = _req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Missing auth token." }, { status: 401 });

  const auth = await requireSuperUser(token);
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const docRes = await auth.adminClient
    .from("league_documents")
    .select("id,file_path")
    .eq("id", id)
    .maybeSingle();
  if (docRes.error) return NextResponse.json({ error: docRes.error.message }, { status: 400 });
  if (!docRes.data) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const filePath = (docRes.data as { file_path: string }).file_path;
  const removeStorageRes = await auth.adminClient.storage.from(DOCUMENT_BUCKET).remove([filePath]);
  if (removeStorageRes.error) {
    return NextResponse.json({ error: removeStorageRes.error.message }, { status: 400 });
  }

  const deleteRes = await auth.adminClient.from("league_documents").delete().eq("id", id);
  if (deleteRes.error) {
    return NextResponse.json({ error: deleteRes.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
