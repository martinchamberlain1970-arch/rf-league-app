import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DOCUMENT_BUCKET = "league-documents";
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

type DocumentCategory = "agm_minutes" | "league_rules" | "captain_meeting_minutes";

function isDocumentCategory(value: string): value is DocumentCategory {
  return value === "agm_minutes" || value === "league_rules" || value === "captain_meeting_minutes";
}

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

  return {
    authUserId: authData.user.id,
    adminClient,
  };
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Missing auth token." }, { status: 401 });

  const auth = await requireSuperUser(token);
  if ("error" in auth) return auth.error;

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid upload form." }, { status: 400 });

  const category = String(formData.get("category") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const rawFile = formData.get("file");

  if (!isDocumentCategory(category)) {
    return NextResponse.json({ error: "Choose a valid document section." }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "Document title is required." }, { status: 400 });
  }
  if (!(rawFile instanceof File)) {
    return NextResponse.json({ error: "Choose a document to upload." }, { status: 400 });
  }
  if (rawFile.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Documents must be 20MB or smaller." }, { status: 400 });
  }
  if (rawFile.type && !ALLOWED_MIME_TYPES.has(rawFile.type)) {
    return NextResponse.json({ error: "Only PDF, Word, and text documents are supported." }, { status: 400 });
  }

  const ext = rawFile.name.includes(".") ? rawFile.name.split(".").pop() : "pdf";
  const safeExt = (ext || "pdf").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "pdf";
  const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "document";
  const filePath = `${category}/${Date.now()}-${safeTitle}.${safeExt}`;
  const bytes = new Uint8Array(await rawFile.arrayBuffer());

  const uploadRes = await auth.adminClient.storage.from(DOCUMENT_BUCKET).upload(filePath, bytes, {
    contentType: rawFile.type || undefined,
    upsert: false,
  });
  if (uploadRes.error) {
    return NextResponse.json({ error: uploadRes.error.message }, { status: 400 });
  }

  const fileUrl = auth.adminClient.storage.from(DOCUMENT_BUCKET).getPublicUrl(filePath).data.publicUrl;
  const insertRes = await auth.adminClient
    .from("league_documents")
    .insert({
      category,
      title,
      description,
      file_name: rawFile.name,
      file_path: filePath,
      file_url: fileUrl,
      uploaded_by_user_id: auth.authUserId,
      is_active: true,
    })
    .select("id,category,title,description,file_name,file_path,file_url,uploaded_by_user_id,created_at,updated_at,is_active")
    .single();

  if (insertRes.error) {
    await auth.adminClient.storage.from(DOCUMENT_BUCKET).remove([filePath]);
    return NextResponse.json({ error: insertRes.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, document: insertRes.data });
}
