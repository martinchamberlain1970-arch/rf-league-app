"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { LeagueEntryPackPayload, LeagueEntryPackPlayer } from "@/lib/league-entry-pack";

type PackResponse = {
  pack: LeagueEntryPackPayload & { status: "draft" | "submitted" | "approved" | "rejected"; submittedAt?: string | null; reviewNotes?: string | null; updatedAt?: string | null };
  season: { id: string; name: string; is_active?: boolean | null };
  team: { id: string; name: string; location_id?: string | null; locationName: string };
  error?: string;
};

const emptyPlayer = (): LeagueEntryPackPlayer => ({
  rowId: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `row-${Date.now()}-${Math.random()}`,
  fullName: "",
  phoneNumber: "",
  email: "",
  isCaptain: false,
  isViceCaptain: false,
  isJunior: false,
  juniorAgeBand: "",
  guardianName: "",
  guardianPhone: "",
  competitionIds: [],
});

const emptyPayload = (): LeagueEntryPackPayload => ({
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  players: [emptyPlayer()],
  competitionNotes: "",
  generalNotes: "",
  phoneSharingConfirmed: false,
  accuracyConfirmed: false,
});

export default function PublicEntryPackPage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token ?? "");
  const [data, setData] = useState<PackResponse | null>(null);
  const [pack, setPack] = useState<LeagueEntryPackPayload>(emptyPayload);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const response = await fetch(`/api/public/entry-pack/${encodeURIComponent(token)}`, { cache: "no-store" });
    const result = (await response.json().catch(() => ({}))) as PackResponse;
    if (!response.ok) {
      setError(result.error ?? "This entry pack could not be loaded.");
      setLoading(false);
      return;
    }
    setData(result);
    setPack({
      contactName: result.pack.contactName ?? "",
      contactEmail: result.pack.contactEmail ?? "",
      contactPhone: result.pack.contactPhone ?? "",
      players: result.pack.players?.length ? result.pack.players.map((player) => ({ ...player, competitionIds: [] })) : [emptyPlayer()],
      competitionNotes: "",
      generalNotes: result.pack.generalNotes ?? "",
      phoneSharingConfirmed: Boolean(result.pack.phoneSharingConfirmed),
      accuracyConfirmed: Boolean(result.pack.accuracyConfirmed),
    });
    setError(null);
    setLoading(false);
  };

  useEffect(() => {
    if (token) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const locked = data?.pack.status === "approved";
  const updatePlayer = (rowId: string, patch: Partial<LeagueEntryPackPlayer>) => {
    setPack((current) => ({
      ...current,
      players: current.players.map((player) => {
        if (player.rowId !== rowId) {
          if (patch.isCaptain) return { ...player, isCaptain: false };
          if (patch.isViceCaptain) return { ...player, isViceCaptain: false };
          return player;
        }
        return { ...player, ...patch };
      }),
    }));
    setMessage(null);
  };

  const save = async (action: "save" | "submit") => {
    setBusy(action);
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/public/entry-pack/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, pack }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setError(result?.error ?? "The entry pack could not be saved.");
      return;
    }
    setMessage(action === "submit" ? "Entry pack submitted successfully. The League Secretary or Chairman will review it." : "Draft saved. You can return using this same private link.");
    await load();
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loading) return <main className="min-h-screen bg-slate-100 p-6"><p className="mx-auto max-w-5xl rounded-2xl bg-white p-5 text-slate-700 shadow-sm">Loading entry pack…</p></main>;
  if (!data || error && !data) return <main className="min-h-screen bg-slate-100 p-6"><section className="mx-auto max-w-3xl rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900"><h1 className="text-xl font-bold">Entry pack unavailable</h1><p className="mt-2">{error}</p></section></main>;

  return (
    <main className="min-h-screen bg-slate-100 p-3 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-3xl bg-gradient-to-r from-slate-950 via-teal-950 to-slate-900 p-5 text-white shadow-xl sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300">Rack &amp; Frame · Private team link</p>
          <h1 className="mt-2 text-3xl font-black">Winter League Entry Pack</h1>
          <p className="mt-2 text-lg font-semibold text-white">{data.team.name}</p>
          <p className="text-sm text-slate-300">{data.team.locationName} · {data.season.name}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold">No app account required</span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold">Telephone numbers kept private</span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold">Status: {data.pack.status}</span>
          </div>
        </header>

        {message ? <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 font-medium text-emerald-900">{message}</section> : null}
        {error ? <section className="rounded-2xl border border-rose-300 bg-rose-50 p-4 font-medium text-rose-900">{error}</section> : null}
        {data.pack.status === "rejected" && data.pack.reviewNotes ? (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <p className="font-bold">Returned for correction</p><p className="mt-1 text-sm">{data.pack.reviewNotes}</p>
          </section>
        ) : null}
        {locked ? <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950"><p className="font-bold">Approved and imported</p><p className="mt-1 text-sm">This pack is now read-only. Contact the League Secretary or Chairman if anything changes.</p></section> : null}

        <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">Instructions</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-800">
            <li>Add every player who will be registered for this team in the winter league. Adults need their full first and second name; use only a first name or recognised playing name for a junior.</li>
            <li>Enter a working match-arranging telephone number for every player. For a junior, use the appropriate parent or guardian contact.</li>
            <li>Select exactly one captain and, if applicable, one vice-captain.</li>
            <li>Use <strong>Save draft</strong> while collecting details. Send the pack only when the roster is complete.</li>
            <li>Knockout competition entry forms will be sent separately and are not part of this league pack.</li>
            <li>After submission, the League Secretary or Chairman will check historic profiles before creating new players.</li>
          </ol>
          <p className="mt-3 rounded-xl bg-white p-3 text-xs text-slate-600">Keep this link within your team. Anyone holding it can amend the pack until it has been approved.</p>
        </section>

        <fieldset disabled={locked} className="space-y-4 disabled:opacity-80">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">1. Person completing this pack</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="text-sm font-semibold text-slate-700">Name *<input value={pack.contactName} onChange={(event) => setPack({ ...pack, contactName: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label>
              <label className="text-sm font-semibold text-slate-700">Telephone *<input type="tel" value={pack.contactPhone} onChange={(event) => setPack({ ...pack, contactPhone: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label>
              <label className="text-sm font-semibold text-slate-700">Email (optional)<input type="email" value={pack.contactEmail} onChange={(event) => setPack({ ...pack, contactEmail: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-xl font-bold text-slate-950">2. Team roster</h2><p className="mt-1 text-sm text-slate-600">All marked fields are required. Telephone numbers are used for arranging league and knockout matches.</p></div>
              <button type="button" onClick={() => setPack((current) => ({ ...current, players: [...current.players, emptyPlayer()] }))} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white">Add player</button>
            </div>
            <div className="mt-4 space-y-4">
              {pack.players.map((player, index) => (
                <article key={player.rowId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3"><h3 className="font-bold text-slate-900">Player {index + 1}</h3>{pack.players.length > 1 ? <button type="button" onClick={() => setPack((current) => ({ ...current, players: current.players.filter((row) => row.rowId !== player.rowId) }))} className="text-sm font-semibold text-rose-700">Remove</button> : null}</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-600">{player.isJunior ? "First / playing name" : "Full name"} *<input value={player.fullName} onChange={(event) => updatePlayer(player.rowId, { fullName: event.target.value })} placeholder={player.isJunior ? "First name or playing name" : "First and second name"} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal" /></label>
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Match telephone *<input type="tel" value={player.phoneNumber} onChange={(event) => updatePlayer(player.rowId, { phoneNumber: event.target.value })} placeholder="Mobile or guardian contact" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal" /></label>
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Email (optional)<input type="email" value={player.email} onChange={(event) => updatePlayer(player.rowId, { email: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal" /></label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm">
                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"><input type="checkbox" checked={player.isCaptain} onChange={(event) => updatePlayer(player.rowId, { isCaptain: event.target.checked, isViceCaptain: event.target.checked ? false : player.isViceCaptain })} /> Captain</label>
                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"><input type="checkbox" checked={player.isViceCaptain} onChange={(event) => updatePlayer(player.rowId, { isViceCaptain: event.target.checked, isCaptain: event.target.checked ? false : player.isCaptain })} /> Vice-captain</label>
                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"><input type="checkbox" checked={player.isJunior} onChange={(event) => updatePlayer(player.rowId, { isJunior: event.target.checked })} /> Under 18</label>
                  </div>
                  {player.isJunior ? <div className="mt-3 grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 md:grid-cols-3"><label className="text-xs font-bold text-amber-900">Age band *<select value={player.juniorAgeBand} onChange={(event) => updatePlayer(player.rowId, { juniorAgeBand: event.target.value as LeagueEntryPackPlayer["juniorAgeBand"] })} className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-normal"><option value="">Select age band</option><option value="under_13">Under 13</option><option value="13_15">Age 13–15</option><option value="16_17">Age 16–17</option></select></label><label className="text-xs font-bold text-amber-900">Parent / guardian name *<input value={player.guardianName} onChange={(event) => updatePlayer(player.rowId, { guardianName: event.target.value })} className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-normal" /></label><label className="text-xs font-bold text-amber-900">Parent / guardian telephone *<input type="tel" value={player.guardianPhone} onChange={(event) => updatePlayer(player.rowId, { guardianPhone: event.target.value })} className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-normal" /></label></div> : null}
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">3. Other team information</h2>
            <p className="mt-1 text-sm text-slate-600">Add any league-registration information the League Secretary or Chairman should know.</p>
            <textarea value={pack.generalNotes} onChange={(event) => setPack({ ...pack, generalNotes: event.target.value })} rows={3} className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </section>

          <section className="rounded-2xl border border-teal-200 bg-teal-50 p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">4. Declaration and submission</h2>
            <div className="mt-3 space-y-3 text-sm text-slate-800">
              <label className="flex items-start gap-3 rounded-xl bg-white p-3"><input type="checkbox" className="mt-1" checked={pack.phoneSharingConfirmed} onChange={(event) => setPack({ ...pack, phoneSharingConfirmed: event.target.checked })} /><span>I confirm that the telephone numbers supplied may be used by league officers, the player’s team captain and relevant opponents for league administration and arranging matches. They must not be published publicly.</span></label>
              <label className="flex items-start gap-3 rounded-xl bg-white p-3"><input type="checkbox" className="mt-1" checked={pack.accuracyConfirmed} onChange={(event) => setPack({ ...pack, accuracyConfirmed: event.target.checked })} /><span>I confirm that the roster and captain roles are accurate and that the people listed know their details are being supplied.</span></label>
            </div>
            {!locked ? <div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={Boolean(busy)} onClick={() => void save("save")} className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-bold text-slate-800 disabled:opacity-50">{busy === "save" ? "Saving…" : "Save draft"}</button><button type="button" disabled={Boolean(busy)} onClick={() => void save("submit")} className="rounded-xl bg-teal-700 px-5 py-3 font-bold text-white disabled:opacity-50">{busy === "submit" ? "Submitting…" : data.pack.status === "submitted" ? "Resubmit updated pack" : "Submit completed pack"}</button></div> : null}
          </section>
        </fieldset>
      </div>
    </main>
  );
}
