import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function normaliseOrigin(value: string | null | undefined) {
  const trimmed = value?.trim().replace(/\/$/, "") ?? "";
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getPublicOrigin(req: NextRequest) {
  const configured =
    normaliseOrigin(process.env.NEXT_PUBLIC_SITE_URL) ||
    normaliseOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    normaliseOrigin(process.env.SITE_URL) ||
    normaliseOrigin(process.env.APP_URL) ||
    normaliseOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    normaliseOrigin(process.env.VERCEL_URL);
  if (configured) return configured;

  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwardedHost) return `${forwardedProto || "https"}://${forwardedHost}`;

  return req.nextUrl.origin;
}

export async function POST(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  let email = "";
  try {
    const body = (await req.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!email) {
    return NextResponse.json({ error: "Email address is required." }, { status: 400 });
  }

  const client = createClient(supabaseUrl, supabaseAnonKey);
  const redirectTo = `${getPublicOrigin(req)}/auth/reset-password`;
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
