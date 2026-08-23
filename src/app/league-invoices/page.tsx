"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import MessageModal from "@/components/MessageModal";
import useAdminStatus from "@/components/useAdminStatus";
import { supabase } from "@/lib/supabase";
import type { LeagueInvoicePreview, LeagueInvoicePreviewResult } from "@/lib/league-invoice";

type Season = { id: string; name: string; is_active?: boolean | null; is_published?: boolean | null };
type Competition = { id: string; name: string; signup_open: boolean; signup_deadline?: string | null; is_archived?: boolean | null; is_completed?: boolean | null };
type EntryCount = { competitionId: string; approved: number; pending: number };
type Batch = { id: string; league_name: string; treasurer_name: string; issue_date: string; due_date: string; created_at: string };
type IssuedInvoice = { id: string; batch_id: string; public_token: string; invoice_number: string; club_name: string; total_pence: number; status: string; issued_at: string };
type LoadResult = { seasons?: Season[]; competitions?: Competition[]; entryCounts?: EntryCount[]; batches?: Batch[]; invoices?: IssuedInvoice[]; migrationRequired?: boolean; error?: string };

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const money = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);

export default function LeagueInvoicesPage() {
  const admin = useAdminStatus();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"preview" | "generate" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [entryCounts, setEntryCounts] = useState<EntryCount[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [issuedInvoices, setIssuedInvoices] = useState<IssuedInvoice[]>([]);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [seasonIds, setSeasonIds] = useState<string[]>([]);
  const [competitionIds, setCompetitionIds] = useState<string[]>([]);
  const [leagueName, setLeagueName] = useState("Gravesend & District Indoor Games League");
  const [treasurerName, setTreasurerName] = useState("Ben Sizer");
  const [issueDate, setIssueDate] = useState(isoDate(new Date()));
  const [dueDate, setDueDate] = useState(() => { const date = new Date(); date.setDate(date.getDate() + 28); return isoDate(date); });
  const [paymentInstructions, setPaymentInstructions] = useState("Please arrange payment with the League Treasurer. Include the invoice number as the payment reference.");
  const [teamFee, setTeamFee] = useState("30.00");
  const [individualFee, setIndividualFee] = useState("3.00");
  const [mickWhiteFee, setMickWhiteFee] = useState("5.00");
  const [preview, setPreview] = useState<LeagueInvoicePreviewResult | null>(null);

  const request = async (body?: Record<string, unknown>) => {
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) throw new Error("Session expired. Please sign in again.");
    const response = await fetch("/api/league/invoices", {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "Invoice request failed.");
    return result;
  };

  const load = async () => {
    setLoading(true);
    try {
      const result = await request() as LoadResult;
      const loadedSeasons = result.seasons ?? [];
      const loadedCompetitions = result.competitions ?? [];
      setSeasons(loadedSeasons);
      setCompetitions(loadedCompetitions);
      setEntryCounts(result.entryCounts ?? []);
      setBatches(result.batches ?? []);
      setIssuedInvoices(result.invoices ?? []);
      setMigrationRequired(Boolean(result.migrationRequired));
      setSeasonIds((current) => current.length ? current : loadedSeasons.filter((season) => season.is_active !== false && season.is_published !== false).map((season) => season.id));
      setCompetitionIds((current) => current.length ? current : loadedCompetitions.filter((competition) => !competition.is_archived && !competition.is_completed).map((competition) => competition.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invoice data could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!admin.loading && admin.canManageLeague) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin.loading, admin.canManageLeague]);

  const payload = (action: "preview" | "generate") => ({
    action,
    leagueName,
    treasurerName,
    issueDate,
    dueDate,
    paymentInstructions,
    seasonIds,
    competitionIds,
    teamFeePence: Math.round(Number(teamFee) * 100),
    individualFeePence: Math.round(Number(individualFee) * 100),
    mickWhiteTeamFeePence: Math.round(Number(mickWhiteFee) * 100),
  });

  const previewInvoices = async () => {
    setBusy("preview"); setMessage(null);
    try {
      const result = await request(payload("preview"));
      setPreview(result.preview as LeagueInvoicePreviewResult);
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invoice preview failed.");
    } finally {
      setBusy(null);
    }
  };

  const generateInvoices = async () => {
    setBusy("generate"); setMessage(null);
    try {
      const result = await request(payload("generate"));
      setPreview(null);
      await load();
      setMessage(`${result.invoices?.length ?? 0} club invoice${result.invoices?.length === 1 ? "" : "s"} generated successfully.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invoices could not be generated.");
    } finally {
      setBusy(null);
    }
  };

  const entryCountByCompetition = useMemo(() => new Map(entryCounts.map((count) => [count.competitionId, count])), [entryCounts]);
  const invoicesByBatch = useMemo(() => {
    const map = new Map<string, IssuedInvoice[]>();
    for (const invoice of issuedInvoices) map.set(invoice.batch_id, [...(map.get(invoice.batch_id) ?? []), invoice]);
    return map;
  }, [issuedInvoices]);

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <RequireAuth>
          <ScreenHeader title="Club Invoices" eyebrow="League Finance" subtitle="Preview and generate one combined invoice per club for league teams and approved competition entries." />
          <MessageModal message={message} onClose={() => setMessage(null)} />
          {!admin.loading && !admin.canManageLeague ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">League Secretary, Chairman or Treasurer access is required.</section> : null}
          {admin.canManageLeague ? <>
            {migrationRequired ? <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950"><h2 className="font-bold">Invoice database setup required</h2><p className="mt-1 text-sm">Run <code>supabase/migrations/20260824_league_club_invoices.sql</code> in Supabase before generating invoices. Preview remains available.</p></section> : null}

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-950">1. Invoice details</h2><p className="text-sm text-slate-600">These details appear on every club invoice in this run.</p></div><Link href="/league" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Back to League Manager</Link></div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-bold text-slate-700">League name<input value={leagueName} onChange={(event) => setLeagueName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label>
                <label className="text-sm font-bold text-slate-700">League Treasurer<input value={treasurerName} onChange={(event) => setTreasurerName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label>
                <label className="text-sm font-bold text-slate-700">Invoice date<input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label>
                <label className="text-sm font-bold text-slate-700">Payment due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label>
              </div>
              <label className="mt-4 block text-sm font-bold text-slate-700">Payment instructions<textarea rows={3} value={paymentInstructions} onChange={(event) => setPaymentInstructions(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-slate-950">2. Fee schedule</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <label className="rounded-xl bg-slate-50 p-4 text-sm font-bold">League team entry (£)<input type="number" min="0" step="0.01" value={teamFee} onChange={(event) => setTeamFee(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" /></label>
                <label className="rounded-xl bg-slate-50 p-4 text-sm font-bold">Per person, other competitions (£)<input type="number" min="0" step="0.01" value={individualFee} onChange={(event) => setIndividualFee(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" /></label>
                <label className="rounded-xl bg-slate-50 p-4 text-sm font-bold">Mick White team entry (£)<input type="number" min="0" step="0.01" value={mickWhiteFee} onChange={(event) => setMickWhiteFee(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" /></label>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">3. League teams</h2><button type="button" onClick={() => setSeasonIds(seasonIds.length === seasons.length ? [] : seasons.map((season) => season.id))} className="text-sm font-bold text-teal-700">{seasonIds.length === seasons.length ? "Clear" : "Select all"}</button></div><p className="mt-1 text-sm text-slate-600">Each selected team is charged once and combined by club.</p><div className="mt-4 space-y-2">{seasons.map((season) => <label key={season.id} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3"><input type="checkbox" className="mt-1" checked={seasonIds.includes(season.id)} onChange={(event) => setSeasonIds((current) => event.target.checked ? [...current, season.id] : current.filter((id) => id !== season.id))} /><span><strong>{season.name}</strong><span className="block text-xs text-slate-500">{season.is_active === false ? "Completed/closed" : "Active"}{season.is_published ? " · Published" : ""}</span></span></label>)}</div></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">4. Competitions</h2><button type="button" onClick={() => setCompetitionIds(competitionIds.length === competitions.length ? [] : competitions.map((competition) => competition.id))} className="text-sm font-bold text-teal-700">{competitionIds.length === competitions.length ? "Clear" : "Select all"}</button></div><p className="mt-1 text-sm text-slate-600">Only approved entries are billed. Open or pending entries block generation.</p><div className="mt-4 max-h-96 space-y-2 overflow-y-auto">{competitions.map((competition) => { const counts = entryCountByCompetition.get(competition.id); return <label key={competition.id} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3"><input type="checkbox" className="mt-1" checked={competitionIds.includes(competition.id)} onChange={(event) => setCompetitionIds((current) => event.target.checked ? [...current, competition.id] : current.filter((id) => id !== competition.id))} /><span className="min-w-0"><strong>{competition.name}</strong><span className="block text-xs text-slate-500">{competition.signup_open ? "Entries open" : "Entries closed"} · {counts?.approved ?? 0} approved{counts?.pending ? ` · ${counts.pending} pending` : ""}</span></span></label>; })}</div></div>
            </section>

            <section className="rounded-2xl border border-teal-200 bg-teal-50 p-5 shadow-sm"><h2 className="text-xl font-bold">5. Preview and generate</h2><p className="mt-1 text-sm text-slate-700">Preview recalculates from the live records. Generate freezes the invoice values and creates shareable print/PDF pages.</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={Boolean(busy) || loading} onClick={() => void previewInvoices()} className="rounded-xl border border-teal-700 bg-white px-5 py-3 font-bold text-teal-800 disabled:opacity-50">{busy === "preview" ? "Preparing preview…" : "Preview club invoices"}</button><button type="button" disabled={Boolean(busy) || !preview || preview.blockers.length > 0 || migrationRequired} onClick={() => void generateInvoices()} className="rounded-xl bg-teal-700 px-5 py-3 font-bold text-white disabled:opacity-50">{busy === "generate" ? "Generating…" : "Generate invoices"}</button></div></section>

            {preview ? <InvoicePreviewSection preview={preview} /> : null}

            {batches.length ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">Generated invoice runs</h2><div className="mt-4 space-y-4">{batches.map((batch) => <article key={batch.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2"><div><strong>{new Date(`${batch.issue_date}T12:00:00`).toLocaleDateString("en-GB", { dateStyle: "long" })}</strong><p className="text-xs text-slate-500">Treasurer: {batch.treasurer_name} · Due {new Date(`${batch.due_date}T12:00:00`).toLocaleDateString("en-GB")}</p></div><span className="font-bold">{money((invoicesByBatch.get(batch.id) ?? []).reduce((sum, invoice) => sum + invoice.total_pence, 0))}</span></div><div className="mt-3 flex flex-wrap gap-2">{(invoicesByBatch.get(batch.id) ?? []).map((invoice) => <Link key={invoice.id} href={`/league-invoice/${invoice.public_token}`} target="_blank" className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">{invoice.invoice_number} · {invoice.club_name} · {money(invoice.total_pence)}</Link>)}</div></article>)}</div></section> : null}
          </> : null}
        </RequireAuth>
      </div>
    </main>
  );
}

function InvoicePreviewSection({ preview }: { preview: LeagueInvoicePreviewResult }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-teal-700">Invoice preview</p><h2 className="text-2xl font-black">{preview.totals.clubs} clubs · {preview.totals.teams} teams · {preview.totals.competitionEntries} competition entries</h2></div><p className="text-3xl font-black">{money(preview.totals.amountPence)}</p></div>{preview.blockers.length ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"><strong>Resolve before generation</strong><ul className="mt-2 list-disc space-y-1 pl-5">{preview.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div> : <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">Ready to generate. No open competitions, pending entries or missing club links were found.</p>}{preview.warnings.length ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Check before generation</strong><ul className="mt-2 list-disc pl-5">{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}<div className="mt-5 grid gap-4 xl:grid-cols-2">{preview.invoices.map((invoice) => <InvoicePreviewCard key={invoice.locationId} invoice={invoice} />)}</div></section>;
}

function InvoicePreviewCard({ invoice }: { invoice: LeagueInvoicePreview }) {
  return <article className="overflow-hidden rounded-2xl border border-slate-200"><header className="bg-slate-950 p-4 text-white"><div className="flex justify-between gap-3"><div><h3 className="text-lg font-bold">{invoice.clubName}</h3><p className="text-xs text-slate-300">For: {invoice.recipientNames.join(", ") || "Club captains"}</p></div><strong className="text-xl">{money(invoice.totalPence)}</strong></div></header><div className="divide-y divide-slate-100">{invoice.items.map((item, index) => <div key={`${item.kind}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 p-3 text-sm"><div><strong>{item.description}</strong><p className="text-xs text-slate-500">{item.detail}</p></div><div className="text-right"><strong>{money(item.totalPence)}</strong><p className="text-xs text-slate-500">{item.quantity} × {money(item.unitPence)}</p></div></div>)}</div></article>;
}
