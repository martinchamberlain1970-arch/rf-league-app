import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeEntryPackPayload, validateEntryPackPayload } from "@/lib/league-entry-pack";
import { normalizePlayerName } from "@/lib/player-name-match";
import { sendNotificationEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const noStore = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function registrationCopyContent(input: {
  teamName: string;
  seasonName: string;
  submittedAt: string;
  players: ReturnType<typeof normalizeEntryPackPayload>["players"];
  generalNotes: string;
}) {
  const roleFor = (player: (typeof input.players)[number]) => player.isCaptain ? "Captain" : player.isViceCaptain ? "Vice-captain" : "Player";
  const playerLines = input.players.filter((player) => player.fullName).map((player) => `${roleFor(player)}: ${player.fullName}`);
  const submitted = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/London" }).format(new Date(input.submittedAt));
  const text = [
    "Rack & Frame League — Team Registration Copy",
    "",
    `Team: ${input.teamName}`,
    `League: ${input.seasonName}`,
    `Submitted: ${submitted}`,
    "",
    "Registered roster",
    ...playerLines,
    ...(input.generalNotes ? ["", "Additional information", input.generalNotes] : []),
    "",
    "A league officer will review this submission before importing the roster.",
    "This is a confirmation copy only. Please do not reply to this automated email.",
  ].join("\n");
  const rows = input.players.filter((player) => player.fullName).map((player) => `<tr><td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;color:#475569">${escapeHtml(roleFor(player))}</td><td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a">${escapeHtml(player.fullName)}</td></tr>`).join("");
  const html = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#0f172a"><div style="background:#0f172a;padding:24px;border-radius:18px 18px 0 0;color:white"><div style="color:#5eead4;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase">Rack &amp; Frame League</div><h1 style="margin:8px 0 0;font-size:26px">Team registration received</h1></div><div style="border:1px solid #cbd5e1;border-top:0;padding:24px;border-radius:0 0 18px 18px"><p style="margin-top:0">This is your copy of the submitted league roster.</p><p><strong>Team:</strong> ${escapeHtml(input.teamName)}<br><strong>League:</strong> ${escapeHtml(input.seasonName)}<br><strong>Submitted:</strong> ${escapeHtml(submitted)}</p><table style="width:100%;border-collapse:collapse;margin:20px 0"><thead><tr style="background:#f1f5f9"><th style="padding:9px 12px;text-align:left">Role</th><th style="padding:9px 12px;text-align:left">Player</th></tr></thead><tbody>${rows}</tbody></table>${input.generalNotes ? `<div style="background:#f8fafc;border-radius:12px;padding:14px"><strong>Additional information</strong><p style="margin:8px 0 0;white-space:pre-wrap">${escapeHtml(input.generalNotes)}</p></div>` : ""}<p style="margin:20px 0 0;color:#475569">A league officer will review this submission before importing the roster.</p><p style="font-size:12px;color:#64748b">This is a confirmation copy only. Please do not reply to this automated email.</p></div></div>`;
  return { text, html };
}

async function loadPack(client: SupabaseClient, token: string) {
  if (!/^[a-f0-9]{48}$/i.test(token)) return { error: "Entry pack not found." as const, status: 404 };
  const packRes = await client
    .from("league_entry_packs")
    .select("id,season_id,team_id,status,contact_name,contact_email,contact_phone,players,competition_notes,general_notes,phone_sharing_confirmed,accuracy_confirmed,submitted_at,review_notes,updated_at")
    .eq("public_token", token)
    .maybeSingle();
  if (packRes.error) return { error: packRes.error.message, status: 400 };
  if (!packRes.data) return { error: "Entry pack not found." as const, status: 404 };
  return { pack: packRes.data };
}

async function loadOtherTeamSelections(client: SupabaseClient, seasonId: string, currentTeamId: string, locationId: string | null) {
  const selectedByName = new Map<string, string>();
  if (!locationId) return { selectedByName };
  const teamsRes = await client
    .from("league_teams")
    .select("id,name")
    .eq("season_id", seasonId)
    .eq("location_id", locationId)
    .neq("id", currentTeamId);
  if (teamsRes.error) return { selectedByName, error: teamsRes.error.message };
  const otherTeams = teamsRes.data ?? [];
  if (otherTeams.length === 0) return { selectedByName };
  const teamNameById = new Map(otherTeams.map((team) => [team.id, team.name]));
  const packsRes = await client
    .from("league_entry_packs")
    .select("team_id,status,players,common_draft_token")
    .eq("season_id", seasonId)
    .in("team_id", otherTeams.map((team) => team.id));
  if (packsRes.error) return { selectedByName, error: packsRes.error.message };
  for (const otherPack of packsRes.data ?? []) {
    if ((otherPack.status === "draft" || otherPack.status === "rejected") && !otherPack.common_draft_token) continue;
    const teamName = teamNameById.get(otherPack.team_id);
    if (!teamName) continue;
    const players = normalizeEntryPackPayload({ players: otherPack.players }).players;
    for (const player of players) {
      const key = normalizePlayerName(player.fullName);
      if (key && !selectedByName.has(key)) selectedByName.set(key, teamName);
    }
  }
  return { selectedByName };
}

export async function GET(_req: NextRequest, context: { params: Promise<{ token: string }> }) {
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers: noStore });
  const { token } = await context.params;
  const client = createClient(supabaseUrl, serviceRoleKey);
  const loaded = await loadPack(client, token);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status, headers: noStore });
  const pack = loaded.pack;

  const [seasonRes, teamRes, startedFixturesRes] = await Promise.all([
    client.from("league_seasons").select("id,name,is_active").eq("id", pack.season_id).maybeSingle(),
    client.from("league_teams").select("id,name,location_id").eq("id", pack.team_id).maybeSingle(),
    client.from("league_fixtures").select("id").eq("season_id", pack.season_id).in("status", ["in_progress", "complete"]).limit(1),
  ]);
  const firstError = seasonRes.error?.message || teamRes.error?.message || startedFixturesRes.error?.message;
  if (firstError) return NextResponse.json({ error: firstError }, { status: 400, headers: noStore });
  if (!seasonRes.data || !teamRes.data) return NextResponse.json({ error: "The linked league team is no longer available." }, { status: 404, headers: noStore });
  if (seasonRes.data.is_active === false || (startedFixturesRes.data?.length ?? 0) > 0) {
    return NextResponse.json({ error: "This league entry period has closed because the league is completed or already in progress." }, { status: 410, headers: noStore });
  }

  let clubPlayers: Array<{ id: string; name: string; selectedByOtherTeam: string | null }> = [];
  if (teamRes.data.location_id) {
    const [clubPlayersRes, selections] = await Promise.all([
      client
        .from("players")
        .select("id,full_name,display_name")
        .eq("location_id", teamRes.data.location_id)
        .or("is_archived.is.null,is_archived.eq.false")
        .order("display_name"),
      loadOtherTeamSelections(client, pack.season_id, pack.team_id, teamRes.data.location_id),
    ]);
    const clubError = clubPlayersRes.error?.message || selections.error;
    if (clubError) return NextResponse.json({ error: clubError }, { status: 400, headers: noStore });
    clubPlayers = (clubPlayersRes.data ?? []).map((player) => ({
      id: player.id,
      name: player.full_name?.trim() || player.display_name,
      selectedByOtherTeam: selections.selectedByName.get(normalizePlayerName(player.full_name?.trim() || player.display_name)) ?? null,
    }));
  }

  const normalizedPack = normalizeEntryPackPayload({
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    players: Array.isArray(pack.players) ? pack.players.map((player: Record<string, unknown>) => ({ ...player, phoneNumber: "", email: "" })) : [],
    competitionNotes: pack.competition_notes,
    generalNotes: pack.general_notes,
    phoneSharingConfirmed: false,
    accuracyConfirmed: pack.accuracy_confirmed,
  });

  let locationName = "Club not set";
  if (teamRes.data.location_id) {
    const locationRes = await client.from("locations").select("name").eq("id", teamRes.data.location_id).maybeSingle();
    if (locationRes.data?.name) locationName = locationRes.data.name;
  }

  return NextResponse.json(
    {
      pack: {
        id: pack.id,
        status: pack.status,
        ...normalizedPack,
        submittedAt: pack.submitted_at,
        reviewNotes: pack.review_notes,
        updatedAt: pack.updated_at,
      },
      season: seasonRes.data,
      team: { ...teamRes.data, locationName },
      clubPlayers,
    },
    { headers: noStore }
  );
}

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers: noStore });
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > 250_000) return NextResponse.json({ error: "Entry pack is too large." }, { status: 413, headers: noStore });

  const { token } = await context.params;
  const client = createClient(supabaseUrl, serviceRoleKey);
  const loaded = await loadPack(client, token);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status, headers: noStore });
  const [seasonStatusRes, startedFixturesRes] = await Promise.all([
    client.from("league_seasons").select("id,name,is_active").eq("id", loaded.pack.season_id).maybeSingle(),
    client.from("league_fixtures").select("id").eq("season_id", loaded.pack.season_id).in("status", ["in_progress", "complete"]).limit(1),
  ]);
  const statusError = seasonStatusRes.error?.message || startedFixturesRes.error?.message;
  if (statusError) return NextResponse.json({ error: statusError }, { status: 400, headers: noStore });
  if (!seasonStatusRes.data || seasonStatusRes.data.is_active === false || (startedFixturesRes.data?.length ?? 0) > 0) {
    return NextResponse.json({ error: "This league entry period has closed because the league is completed or already in progress." }, { status: 410, headers: noStore });
  }
  if (loaded.pack.status === "approved") {
    return NextResponse.json({ error: "This entry pack has been approved and is now read-only. Contact a league officer for changes." }, { status: 409, headers: noStore });
  }
  if (loaded.pack.status === "submitted") {
    return NextResponse.json({ error: "This team registration has already been submitted and is awaiting review." }, { status: 409, headers: noStore });
  }

  const body = await req.json().catch(() => null);
  if (body?.action === "reset") {
    const now = new Date().toISOString();
    const resetRes = await client.from("league_entry_packs").update({
      status: "draft",
      contact_name: null,
      contact_email: null,
      contact_phone: null,
      players: [],
      competition_notes: null,
      general_notes: null,
      phone_sharing_confirmed: false,
      accuracy_confirmed: false,
      submitted_at: null,
      reviewed_at: null,
      reviewed_by_user_id: null,
      review_notes: null,
      updated_at: now,
    }).eq("id", loaded.pack.id);
    if (resetRes.error) return NextResponse.json({ error: resetRes.error.message }, { status: 400, headers: noStore });
    return NextResponse.json({ ok: true, status: "draft", updatedAt: now }, { headers: noStore });
  }
  const action = body?.action === "submit" ? "submit" : "save";
  const receiptEmail = action === "submit" ? String(body?.receiptEmail ?? "").trim().toLowerCase().slice(0, 254) : "";
  if (receiptEmail && !validEmail(receiptEmail)) {
    return NextResponse.json({ error: "Enter a valid email address for the optional submission copy." }, { status: 400, headers: noStore });
  }
  const payload = normalizeEntryPackPayload(body?.pack);
  const validationError = validateEntryPackPayload(payload, action === "submit");
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400, headers: noStore });

  const teamRes = await client.from("league_teams").select("id,name,location_id").eq("id", loaded.pack.team_id).maybeSingle();
  if (teamRes.error || !teamRes.data) return NextResponse.json({ error: teamRes.error?.message ?? "The linked league team is no longer available." }, { status: 400, headers: noStore });
  const selections = await loadOtherTeamSelections(client, loaded.pack.season_id, loaded.pack.team_id, teamRes.data.location_id);
  if (selections.error) return NextResponse.json({ error: selections.error }, { status: 400, headers: noStore });
  const conflicts = payload.players.flatMap((player) => {
    const selectedBy = selections.selectedByName.get(normalizePlayerName(player.fullName));
    return selectedBy ? [`${player.fullName} has already been selected for ${selectedBy}.`] : [];
  });
  if (conflicts.length > 0) {
    return NextResponse.json({ error: `${conflicts.slice(0, 5).join(" ")} Remove the duplicate selection or contact the League Secretary.` }, { status: 409, headers: noStore });
  }

  payload.contactName = "";
  payload.contactEmail = "";
  payload.contactPhone = "";
  payload.players = payload.players.map((player) => ({ ...player, phoneNumber: "", email: "", competitionIds: [] }));
  payload.competitionNotes = "";
  payload.phoneSharingConfirmed = false;

  const now = new Date().toISOString();
  const updateRes = await client
    .from("league_entry_packs")
    .update({
      status: action === "submit" ? "submitted" : "draft",
      contact_name: null,
      contact_email: null,
      contact_phone: null,
      players: payload.players,
      competition_notes: payload.competitionNotes || null,
      general_notes: payload.generalNotes || null,
      phone_sharing_confirmed: false,
      accuracy_confirmed: payload.accuracyConfirmed,
      submitted_at: action === "submit" ? now : null,
      reviewed_at: null,
      reviewed_by_user_id: null,
      review_notes: null,
      updated_at: now,
    })
    .eq("id", loaded.pack.id);
  if (updateRes.error) return NextResponse.json({ error: updateRes.error.message }, { status: 400, headers: noStore });

  let receiptStatus: "not_requested" | "sent" | "failed" = "not_requested";
  if (action === "submit" && receiptEmail) {
    const content = registrationCopyContent({
      teamName: teamRes.data.name,
      seasonName: seasonStatusRes.data.name,
      submittedAt: now,
      players: payload.players,
      generalNotes: payload.generalNotes,
    });
    try {
      const emailResult = await sendNotificationEmail({
        to: receiptEmail,
        subject: `Rack & Frame League — ${teamRes.data.name} registration copy`,
        text: content.text,
        html: content.html,
      });
      receiptStatus = emailResult.sent ? "sent" : "failed";
    } catch {
      receiptStatus = "failed";
    }
  }
  return NextResponse.json({ ok: true, status: action === "submit" ? "submitted" : "draft", updatedAt: now, receiptStatus }, { headers: noStore });
}
