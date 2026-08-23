"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import type { LeagueInvoiceItem } from "@/lib/league-invoice";

type InvoiceData = {
  invoice: {
    invoice_number: string;
    club_name: string;
    recipient_names: string[];
    items: LeagueInvoiceItem[];
    total_pence: number;
    status: "issued" | "paid" | "cancelled";
    issued_at: string;
    paid_at?: string | null;
  };
  batch: {
    league_name: string;
    treasurer_name: string;
    issue_date: string;
    due_date: string;
    payment_instructions?: string | null;
  };
  error?: string;
};

const money = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { dateStyle: "long" });

export default function PublicLeagueInvoicePage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token ?? "");
  const [data, setData] = useState<InvoiceData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const response = await fetch(`/api/public/league-invoice/${encodeURIComponent(token)}`, { cache: "no-store" });
      const result = await response.json().catch(() => ({})) as InvoiceData;
      if (!response.ok) return setError(result.error ?? "Invoice could not be loaded.");
      setData(result);
    };
    if (token) void load();
  }, [token]);

  if (error) return <main className="min-h-screen bg-slate-100 p-6"><section className="mx-auto max-w-3xl rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-950"><h1 className="text-xl font-bold">Invoice unavailable</h1><p className="mt-2">{error}</p></section></main>;
  if (!data) return <main className="min-h-screen bg-slate-100 p-6"><p className="mx-auto max-w-4xl rounded-2xl bg-white p-5 shadow-sm">Loading invoice…</p></main>;

  const { invoice, batch } = data;
  return (
    <main className="min-h-screen bg-slate-200 p-3 print:bg-white print:p-0 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex justify-end gap-3 print:hidden"><button type="button" onClick={() => window.print()} className="rounded-xl bg-teal-700 px-5 py-3 font-bold text-white">Print or save as PDF</button></div>
        <article className="min-h-[1080px] bg-white p-6 shadow-xl print:min-h-0 print:shadow-none sm:p-10">
          <header className="flex flex-wrap items-start justify-between gap-6 border-b-4 border-teal-600 pb-6">
            <div className="flex items-center gap-4"><Image src="/icons/rack-frame-icon-192-v2.png" alt="Rack & Frame League" width={80} height={80} className="h-20 w-20 rounded-2xl" /><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">Rack &amp; Frame League</p><h1 className="mt-1 max-w-xl text-2xl font-black text-slate-950 sm:text-3xl">{batch.league_name}</h1></div></div>
            <div className="text-right"><p className="text-sm font-bold uppercase tracking-wide text-slate-500">Invoice</p><p className="text-xl font-black text-slate-950">{invoice.invoice_number}</p><span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase ${invoice.status === "paid" ? "bg-emerald-100 text-emerald-800" : invoice.status === "cancelled" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"}`}>{invoice.status}</span></div>
          </header>

          {invoice.status === "cancelled" ? <p className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4 font-bold text-rose-900">This invoice has been cancelled and is not payable.</p> : null}

          <section className="mt-8 grid gap-6 sm:grid-cols-2">
            <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Invoice to</p><h2 className="mt-1 text-xl font-black">{invoice.club_name}</h2><p className="mt-2 text-sm text-slate-600">For the attention of:<br />{invoice.recipient_names.join(", ") || "Club captains"}</p></div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm sm:justify-self-end"><dt className="font-bold text-slate-500">Invoice date</dt><dd className="text-right">{dateLabel(batch.issue_date)}</dd><dt className="font-bold text-slate-500">Payment due</dt><dd className="text-right">{dateLabel(batch.due_date)}</dd><dt className="font-bold text-slate-500">Treasurer</dt><dd className="text-right">{batch.treasurer_name}</dd></dl>
          </section>

          <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full border-collapse text-sm"><thead className="bg-slate-950 text-left text-white"><tr><th className="p-3">Description</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Rate</th><th className="p-3 text-right">Amount</th></tr></thead><tbody>{invoice.items.map((item, index) => <tr key={`${item.kind}-${index}`} className="border-b border-slate-100 align-top"><td className="p-3"><strong>{item.description}</strong><span className="mt-1 block text-xs text-slate-500">{item.detail}</span></td><td className="p-3 text-right">{item.quantity}</td><td className="p-3 text-right">{money(item.unitPence)}</td><td className="p-3 text-right font-bold">{money(item.totalPence)}</td></tr>)}</tbody><tfoot><tr className="bg-teal-50"><td colSpan={3} className="p-4 text-right text-lg font-black">Total due</td><td className="p-4 text-right text-2xl font-black text-teal-900">{money(invoice.total_pence)}</td></tr></tfoot></table>
          </section>

          <section className="mt-8 rounded-2xl bg-slate-50 p-5"><h2 className="font-bold">Payment information</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{batch.payment_instructions?.trim() || `Please contact League Treasurer ${batch.treasurer_name} to arrange payment. Quote invoice ${invoice.invoice_number}.`}</p></section>

          <footer className="mt-10 border-t border-slate-200 pt-5 text-center text-xs text-slate-500">Issued by {batch.league_name} · Treasurer: {batch.treasurer_name}</footer>
        </article>
      </div>
    </main>
  );
}
