import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireLeagueManager } from "@/lib/server-role";
import { logServerAudit } from "@/lib/server-audit";
import { buildLeagueInvoicePreview } from "@/lib/league-invoice";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const noStore = { "Cache-Control": "no-store, max-age=0" };

async function authorize(req: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) throw new Error("SERVER_NOT_CONFIGURED");
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("UNAUTHORIZED");
  const authClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const authRes = await authClient.auth.getUser(token);
  if (authRes.error || !authRes.data.user) throw new Error("UNAUTHORIZED");
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  await requireLeagueManager(adminClient, authRes.data.user);
  return { adminClient, user: authRes.data.user };
}

function responseForError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  if (message === "SERVER_NOT_CONFIGURED") return NextResponse.json({ error: "Server is not configured." }, { status: 500, headers: noStore });
  if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: noStore });
  if (message === "FORBIDDEN_LEAGUE_MANAGER") return NextResponse.json({ error: "League Secretary, Chairman or Treasurer access is required." }, { status: 403, headers: noStore });
  return NextResponse.json({ error: message }, { status: 400, headers: noStore });
}

async function loadBillingData(client: SupabaseClient) {
  const [seasonsRes, teamsRes, locationsRes, playersRes, membersRes, competitionsRes, entriesRes] = await Promise.all([
    client.from("league_seasons").select("id,name,is_active,is_published,created_at").order("created_at", { ascending: false }),
    client.from("league_teams").select("id,season_id,location_id,name,is_active"),
    client.from("locations").select("id,name").order("name"),
    client.from("players").select("id,display_name,full_name,location_id"),
    client.from("league_team_members").select("team_id,player_id,is_captain,is_vice_captain"),
    client.from("competitions").select("id,name,signup_open,signup_deadline,is_archived,is_completed,created_at").eq("competition_format", "knockout").order("created_at", { ascending: false }),
    client.from("competition_entries").select("id,competition_id,player_id,status,note"),
  ]);
  const firstError = seasonsRes.error?.message || teamsRes.error?.message || locationsRes.error?.message || playersRes.error?.message || membersRes.error?.message || competitionsRes.error?.message || entriesRes.error?.message;
  if (firstError) throw new Error(firstError);
  return {
    seasons: seasonsRes.data ?? [],
    teams: teamsRes.data ?? [],
    locations: locationsRes.data ?? [],
    players: playersRes.data ?? [],
    members: membersRes.data ?? [],
    competitions: competitionsRes.data ?? [],
    entries: entriesRes.data ?? [],
  };
}

type InvoiceRequest = {
  action?: "preview" | "generate";
  leagueName?: string;
  treasurerName?: string;
  issueDate?: string;
  dueDate?: string;
  paymentInstructions?: string;
  seasonIds?: string[];
  competitionIds?: string[];
  teamFeePence?: number;
  individualFeePence?: number;
  mickWhiteTeamFeePence?: number;
};

function normalizedRequest(body: InvoiceRequest) {
  const issueDate = String(body.issueDate ?? "").trim();
  const dueDate = String(body.dueDate ?? "").trim();
  const leagueName = String(body.leagueName ?? "").trim().slice(0, 180);
  const treasurerName = String(body.treasurerName ?? "").trim().slice(0, 140);
  const paymentInstructions = String(body.paymentInstructions ?? "").trim().slice(0, 2000);
  const seasonIds = Array.from(new Set((Array.isArray(body.seasonIds) ? body.seasonIds : []).map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))).slice(0, 20);
  const competitionIds = Array.from(new Set((Array.isArray(body.competitionIds) ? body.competitionIds : []).map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))).slice(0, 100);
  const teamFeePence = Number(body.teamFeePence ?? 3000);
  const individualFeePence = Number(body.individualFeePence ?? 300);
  const mickWhiteTeamFeePence = Number(body.mickWhiteTeamFeePence ?? 500);
  if (!leagueName) throw new Error("League name is required.");
  if (!treasurerName) throw new Error("Treasurer name is required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error("Enter valid issue and due dates.");
  if (dueDate < issueDate) throw new Error("The due date cannot be before the issue date.");
  if (!seasonIds.length && !competitionIds.length) throw new Error("Select at least one league or competition.");
  for (const [label, value] of [["team fee", teamFeePence], ["individual fee", individualFeePence], ["Mick White fee", mickWhiteTeamFeePence]] as const) {
    if (!Number.isInteger(value) || value < 0 || value > 100000) throw new Error(`Enter a valid ${label}.`);
  }
  return { leagueName, treasurerName, issueDate, dueDate, paymentInstructions, seasonIds, competitionIds, teamFeePence, individualFeePence, mickWhiteTeamFeePence };
}

export async function GET(req: NextRequest) {
  try {
    const { adminClient } = await authorize(req);
    const [data, batchesRes, invoicesRes] = await Promise.all([
      loadBillingData(adminClient),
      adminClient.from("league_invoice_batches").select("id,league_name,treasurer_name,issue_date,due_date,created_at").order("created_at", { ascending: false }).limit(20),
      adminClient.from("league_invoices").select("id,batch_id,public_token,invoice_number,club_name,total_pence,status,issued_at").order("issued_at", { ascending: false }).limit(200),
    ]);
    const missingInvoices = batchesRes.error?.message?.toLowerCase().includes("does not exist") || invoicesRes.error?.message?.toLowerCase().includes("does not exist") || batchesRes.error?.message?.toLowerCase().includes("schema cache") || invoicesRes.error?.message?.toLowerCase().includes("schema cache");
    if ((batchesRes.error || invoicesRes.error) && !missingInvoices) throw new Error(batchesRes.error?.message ?? invoicesRes.error?.message);
    return NextResponse.json({
      seasons: data.seasons,
      competitions: data.competitions,
      entryCounts: data.competitions.map((competition) => ({
        competitionId: competition.id,
        approved: data.entries.filter((entry) => entry.competition_id === competition.id && entry.status === "approved").length,
        pending: data.entries.filter((entry) => entry.competition_id === competition.id && entry.status === "pending").length,
      })),
      batches: missingInvoices ? [] : batchesRes.data ?? [],
      invoices: missingInvoices ? [] : invoicesRes.data ?? [],
      migrationRequired: Boolean(missingInvoices),
    }, { headers: noStore });
  } catch (error) {
    return responseForError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { adminClient, user } = await authorize(req);
    const body = (await req.json().catch(() => ({}))) as InvoiceRequest;
    const values = normalizedRequest(body);
    const data = await loadBillingData(adminClient);
    const preview = buildLeagueInvoicePreview({
      selectedSeasonIds: values.seasonIds,
      selectedCompetitionIds: values.competitionIds,
      teamFeePence: values.teamFeePence,
      individualFeePence: values.individualFeePence,
      mickWhiteTeamFeePence: values.mickWhiteTeamFeePence,
      ...data,
    });
    if (body.action !== "generate") return NextResponse.json({ ok: true, preview }, { headers: noStore });
    if (preview.blockers.length) throw new Error(`Invoices cannot be generated yet. ${preview.blockers.join(" ")}`);

    const batchRes = await adminClient.from("league_invoice_batches").insert({
      league_name: values.leagueName,
      treasurer_name: values.treasurerName,
      issue_date: values.issueDate,
      due_date: values.dueDate,
      payment_instructions: values.paymentInstructions || null,
      season_ids: values.seasonIds,
      competition_ids: values.competitionIds,
      league_team_fee_pence: values.teamFeePence,
      individual_fee_pence: values.individualFeePence,
      mick_white_team_fee_pence: values.mickWhiteTeamFeePence,
      created_by_user_id: user.id,
    }).select("id").single();
    if (batchRes.error) throw new Error(batchRes.error.message);

    try {
      const year = Number(values.issueDate.slice(0, 4));
      const prefix = `GDIGL-${year}-`;
      const existingRes = await adminClient.from("league_invoices").select("invoice_number").like("invoice_number", `${prefix}%`);
      if (existingRes.error) throw new Error(existingRes.error.message);
      const used = new Set((existingRes.data ?? []).map((row) => row.invoice_number));
      let sequence = 1;
      const rows = preview.invoices.map((invoice) => {
        while (used.has(`${prefix}${String(sequence).padStart(3, "0")}`)) sequence += 1;
        const invoiceNumber = `${prefix}${String(sequence).padStart(3, "0")}`;
        used.add(invoiceNumber);
        sequence += 1;
        return {
          batch_id: batchRes.data.id,
          invoice_number: invoiceNumber,
          location_id: invoice.locationId,
          club_name: invoice.clubName,
          recipient_names: invoice.recipientNames,
          items: invoice.items,
          total_pence: invoice.totalPence,
          status: "issued",
        };
      });
      const invoiceRes = await adminClient.from("league_invoices").insert(rows).select("id,public_token,invoice_number,club_name,total_pence,status,issued_at");
      if (invoiceRes.error) throw new Error(invoiceRes.error.message);
      await logServerAudit(adminClient, {
        actorUserId: user.id,
        actorEmail: user.email ?? null,
        actorRole: "league_manager",
        action: "league_invoice_batch_generated",
        entityType: "league_invoice_batch",
        entityId: batchRes.data.id,
        summary: `${invoiceRes.data.length} club invoices generated for ${values.leagueName}.`,
        meta: { invoice_count: invoiceRes.data.length, total_pence: preview.totals.amountPence, season_ids: values.seasonIds, competition_ids: values.competitionIds },
      });
      return NextResponse.json({ ok: true, batchId: batchRes.data.id, invoices: invoiceRes.data }, { headers: noStore });
    } catch (error) {
      await adminClient.from("league_invoice_batches").delete().eq("id", batchRes.data.id);
      throw error;
    }
  } catch (error) {
    return responseForError(error);
  }
}
