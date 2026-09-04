"use client";

import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import { useAppDialog } from "@/components/AppDialogProvider";
import { supabase } from "@/lib/supabase";

type Attestation = { id: string; clubName: string; attestor_name: string; attestor_capacity: string; submitted_at: string };
const publicUrl = "https://rf-league-app.vercel.app/handicap-consultation/premier-handicap-2026-27";

export default function HandicapConsultationReviewPage() {
  const { showConfirm } = useAppDialog();
  const [attestations, setAttestations] = useState<Attestation[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const request = useCallback(async (method = "GET", body?: object) => {
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    const response = await fetch("/api/league/handicap-consultation", {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "The attestations could not be loaded.");
    return payload;
  }, []);

  const load = useCallback(async () => {
    try {
      setError("");
      const payload = await request();
      setAttestations(payload.attestations ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The attestations could not be loaded.");
    }
  }, [request]);

  useEffect(() => { void load(); }, [load]);

  async function reset(id: string, clubName: string) {
    const confirmed = await showConfirm({
      title: "Remove club attestation?",
      description: `Remove ${clubName}'s attestation so the club can submit a corrected response?`,
      confirmLabel: "Remove and allow resubmission",
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      await request("DELETE", { id });
      setMessage(`${clubName}'s attestation was removed. The club can now submit again.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The attestation could not be removed.");
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(publicUrl);
    setMessage("Public attestation link copied.");
  }

  return (
    <RequireAuth>
      <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <ScreenHeader title="Handicap Consultation" eyebrow="League governance" subtitle="Review the written procedural attestations received from participating clubs." />
          {error ? <section className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-900">{error}</section> : null}
          {message ? <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">{message}</section> : null}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-xl font-black">Club attestations</h2><p className="mt-1 text-sm text-slate-600">{attestations.length} written response{attestations.length === 1 ? "" : "s"} received.</p></div>
              <button type="button" onClick={() => void copyLink()} className="rounded-xl bg-teal-700 px-4 py-2 font-bold text-white">Copy public link</button>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead><tr><th className="p-3">Club</th><th className="p-3">Representative</th><th className="p-3">Capacity</th><th className="p-3">Submitted</th><th className="p-3">Correction</th></tr></thead>
                <tbody>
                  {attestations.map((row) => (
                    <tr key={row.id} className="border-t border-slate-200">
                      <td className="p-3 font-bold">{row.clubName}</td><td className="p-3">{row.attestor_name}</td><td className="p-3">{row.attestor_capacity === "captain" ? "Captain" : "Club representative"}</td><td className="p-3">{new Date(row.submitted_at).toLocaleString("en-GB")}</td>
                      <td className="p-3"><button type="button" onClick={() => void reset(row.id, row.clubName)} className="rounded-lg border border-rose-300 px-3 py-2 font-bold text-rose-800">Remove and resubmit</button></td>
                    </tr>
                  ))}
                  {attestations.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-slate-500">No attestations have been received yet.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </RequireAuth>
  );
}
