import { NextRequest, NextResponse } from "next/server";
import { sendNotificationEmail } from "@/lib/email";

export const runtime = "nodejs";

type EnquiryBody = {
  name?: unknown;
  email?: unknown;
  leagueName?: unknown;
  area?: unknown;
  teamCount?: unknown;
  message?: unknown;
  website?: unknown;
  consent?: unknown;
};

const requestLog = new Map<string, { count: number; resetAt: number }>();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function limited(request: NextRequest) {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const current = requestLog.get(key);
  if (!current || current.resetAt <= now) {
    requestLog.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  current.count += 1;
  requestLog.set(key, current);
  return current.count > 5;
}

export async function POST(request: NextRequest) {
  if (limited(request)) {
    return NextResponse.json({ error: "Too many enquiries have been sent. Please try again later." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as EnquiryBody;
  if (text(body.website, 200)) return NextResponse.json({ ok: true });

  const name = text(body.name, 100);
  const email = text(body.email, 180).toLowerCase();
  const leagueName = text(body.leagueName, 160);
  const area = text(body.area, 120);
  const teamCount = text(body.teamCount, 60);
  const enquiry = text(body.message, 1500);

  if (!name || !emailPattern.test(email) || !leagueName || !area || !teamCount || !enquiry || body.consent !== true) {
    return NextResponse.json({ error: "Please complete every field and confirm that we may respond to your enquiry." }, { status: 400 });
  }

  const subjectLeague = leagueName.replace(/[\r\n]+/g, " ").slice(0, 100);
  const plainText = [
    "New Rack & Frame product enquiry",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `League or club: ${leagueName}`,
    `Area: ${area}`,
    `Approximate teams: ${teamCount}`,
    "",
    "Enquiry:",
    enquiry,
    "",
    "The sender confirmed that Rack & Frame may use these details to respond to this enquiry.",
  ].join("\n");
  const html = `<h1>New Rack &amp; Frame product enquiry</h1><table cellpadding="6" cellspacing="0"><tr><th align="left">Name</th><td>${escapeHtml(name)}</td></tr><tr><th align="left">Email</th><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr><tr><th align="left">League or club</th><td>${escapeHtml(leagueName)}</td></tr><tr><th align="left">Area</th><td>${escapeHtml(area)}</td></tr><tr><th align="left">Approximate teams</th><td>${escapeHtml(teamCount)}</td></tr></table><h2>Enquiry</h2><p style="white-space:pre-wrap">${escapeHtml(enquiry)}</p><p><small>The sender confirmed that Rack &amp; Frame may use these details to respond to this enquiry.</small></p>`;

  const result = await sendNotificationEmail({
    subject: `Rack & Frame enquiry — ${subjectLeague}`,
    text: plainText,
    html,
  });
  if (!result.sent) {
    console.error("Product enquiry email failed:", result.reason);
    return NextResponse.json({ error: "The enquiry could not be delivered. Please try again shortly." }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
