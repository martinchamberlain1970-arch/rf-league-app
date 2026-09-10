"use client";

import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import { useAppDialog } from "@/components/AppDialogProvider";
import { supabase } from "@/lib/supabase";

type Confirmation = { id: string; representative_name: string; representative_role: string; confirmed_at: string };
type Team = { id: string; name: string; confirmation: Confirmation | null };
type Round = { title: string; is_open: boolean; snapshot_at: string };
const publicUrl = "https://rf-league-app.vercel.app/premier-handicaps/premier-2026-27-restored-handicaps";

export default function PremierHandicapConfirmationsPage() {
  const { showConfirm } = useAppDialog();
  const [round, setRound] = useState<Round | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const request = useCallback(async (method = "GET", body?: object) => {
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    const response = await fetch("/api/league/premier-handicap-confirmations", {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "The team confirmations could not be loaded.");
    return payload;
  }, []);

  const load = useCallback(async () => {
    try {
      setError("");
      const payload = await request();
      setRound(payload.round);
      setTeams(payload.teams ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The team confirmations could not be loaded.");
    }
  }, [request]);

  useEffect(() => { void load(); }, [load]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setMessage("Premier handicap confirmation link copied.");
    } catch {
      setError(`Copy was unavailable. Use this link: ${publicUrl}`);
    }
  }

  async function toggleOpen() {
    if (!round) return;
    const next = !round.is_open;
    const confirmed = await showConfirm({
      title: next ? "Reopen confirmations?" : "Close confirmations?",
      description: next ? "Premier captains and vice-captains will be able to submit again." : "Teams that have not yet responded will no longer be able to confirm.",
      confirmLabel: next ? "Reopen confirmations" : "Close confirmations",
      tone: next ? "default" : "danger",
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await request("PATCH", { isOpen: next });
      setMessage(next ? "Confirmations reopened." : "Confirmations closed.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The confirmation status could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  async function removeConfirmation(team: Team) {
    if (!team.confirmation) return;
    const confirmed = await showConfirm({
      title: "Remove team confirmation?",
      description: `Remove ${team.name}'s confirmation so its captain or vice-captain can submit a corrected response?`,
      confirmLabel: "Remove and allow resubmission",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await request("DELETE", { id: team.confirmation.id });
      setMessage(`${team.name}'s confirmation was removed.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The confirmation could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  const confirmedCount = teams.filter((team) => team.confirmation).length;

  return (
    <RequireAuth>
      <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <ScreenHeader title="Premier Handicap Confirmations" eyebrow="League administration" subtitle="Track each Premier League team's check of the restored pre-season handicap list." />
          {error ? <section className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-900">{error}</section> : null}
          {message ? <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">{message}</section> : null}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-950">{round?.title ?? "Premier League Handicaps 2026/27"}</h2>
                <p className="mt-1 text-sm text-slate-600">{confirmedCount} of {teams.length} teams confirmed · {round?.is_open ? "Open" : "Closed"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void copyLink()} className="rounded-xl border border-teal-600 px-4 py-2 font-bold text-teal-800">Copy public link</button>
                <button type="button" disabled={!round || busy} onClick={() => void toggleOpen()} className={`rounded-xl px-4 py-2 font-bold text-white disabled:opacity-50 ${round?.is_open ? "bg-rose-700" : "bg-teal-700"}`}>{round?.is_open ? "Close confirmations" : "Reopen confirmations"}</button>
              </div>
            </div>
            {round ? <p className="mt-3 text-xs text-slate-500">Frozen snapshot: {new Date(round.snapshot_at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}</p> : null}
          </section>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50"><tr><th className="p-4">Premier team</th><th className="p-4">Status</th><th className="p-4">Confirmed by</th><th className="p-4">Time</th><th className="p-4">Correction</th></tr></thead>
                <tbody>
                  {teams.map((team) => {
                    const autoAttested = team.confirmation?.representative_name.startsWith("System auto-attestation") ?? false;
                    return (
                    <tr key={team.id} className="border-t border-slate-200">
                      <td className="p-4 font-bold text-slate-950">{team.name}</td>
                      <td className="p-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${autoAttested ? "bg-sky-100 text-sky-900" : team.confirmation ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{autoAttested ? "Auto-attested" : team.confirmation ? "Confirmed" : "Awaiting check"}</span></td>
                      <td className="p-4">{autoAttested ? "System deadline process" : team.confirmation ? `${team.confirmation.representative_name} · ${team.confirmation.representative_role === "captain" ? "Captain" : "Vice-captain"}` : "—"}</td>
                      <td className="p-4">{team.confirmation ? new Date(team.confirmation.confirmed_at).toLocaleString("en-GB") : "—"}</td>
                      <td className="p-4">{team.confirmation ? <button type="button" disabled={busy} onClick={() => void removeConfirmation(team)} className="rounded-lg border border-rose-300 px-3 py-2 font-bold text-rose-800 disabled:opacity-50">Remove and resubmit</button> : "—"}</td>
                    </tr>
                    );
                  })}
                  {teams.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-slate-500">Run the Premier handicap confirmation SQL to create the snapshot.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </RequireAuth>
  );
}
