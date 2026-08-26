"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import MessageModal from "@/components/MessageModal";
import { useAppDialog } from "@/components/AppDialogProvider";
import type { LeagueEntryPackPayload, LeagueEntryPackPlayer } from "@/lib/league-entry-pack";
import { normalizePlayerName, playerNameMatchKind } from "@/lib/player-name-match";

type PackResponse = {
  pack: LeagueEntryPackPayload & { status: "draft" | "submitted" | "approved" | "rejected"; submittedAt?: string | null; reviewNotes?: string | null; updatedAt?: string | null };
  season: { id: string; name: string; is_active?: boolean | null };
  team: { id: string; name: string; location_id?: string | null; locationName: string };
  clubPlayers: Array<{ id: string; name: string; selectedByOtherTeam: string | null }>;
  error?: string;
};

const emptyPlayer = (role: "captain" | "vice" | "player" = "player"): LeagueEntryPackPlayer => ({
  rowId: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `row-${Date.now()}-${Math.random()}`,
  fullName: "",
  phoneNumber: "",
  email: "",
  isCaptain: role === "captain",
  isViceCaptain: role === "vice",
  competitionIds: [],
});

const defaultRoster = () => [emptyPlayer("captain"), emptyPlayer("vice"), ...Array.from({ length: 5 }, () => emptyPlayer())];

const withDefaultRosterSlots = (players: LeagueEntryPackPlayer[]) => {
  const source = players.map((player) => ({ ...player, competitionIds: [] }));
  const captainIndex = source.findIndex((player) => player.isCaptain);
  const captain = captainIndex >= 0 ? { ...source[captainIndex], isCaptain: true, isViceCaptain: false } : emptyPlayer("captain");
  const viceIndex = source.findIndex((player, index) => index !== captainIndex && player.isViceCaptain);
  const vice = viceIndex >= 0 ? { ...source[viceIndex], isCaptain: false, isViceCaptain: true } : emptyPlayer("vice");
  const otherPlayers: LeagueEntryPackPlayer[] = source
    .filter((_, index) => index !== captainIndex && index !== viceIndex)
    .map((player) => ({ ...player, isCaptain: false, isViceCaptain: false }));
  while (otherPlayers.length < 5) otherPlayers.push(emptyPlayer());
  return [captain, vice, ...otherPlayers];
};

const emptyPayload = (): LeagueEntryPackPayload => ({
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  players: defaultRoster(),
  competitionNotes: "",
  generalNotes: "",
  phoneSharingConfirmed: false,
  accuracyConfirmed: false,
});

export default function PublicEntryPackPage() {
  const { showConfirm } = useAppDialog();
  const params = useParams<{ token: string }>();
  const token = String(params?.token ?? "");
  const [data, setData] = useState<PackResponse | null>(null);
  const [pack, setPack] = useState<LeagueEntryPackPayload>(emptyPayload);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "submit" | "reset" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [emailCopyRequested, setEmailCopyRequested] = useState(false);
  const [receiptEmail, setReceiptEmail] = useState("");
  const [receiptStatus, setReceiptStatus] = useState<"sent" | "failed" | null>(null);
  const [lastAddedPlayerId, setLastAddedPlayerId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const response = await fetch(`/api/public/entry-pack/${encodeURIComponent(token)}`, { cache: "no-store" });
    const result = (await response.json().catch(() => ({}))) as PackResponse;
    if (!response.ok) {
      setError(result.error ?? "This team registration could not be loaded.");
      setLoading(false);
      return;
    }
    setData(result);
    setPack({
      contactName: result.pack.contactName ?? "",
      contactEmail: result.pack.contactEmail ?? "",
      contactPhone: result.pack.contactPhone ?? "",
      players: withDefaultRosterSlots(result.pack.players ?? []),
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

  const selectedNames = new Set(pack.players.map((player) => normalizePlayerName(player.fullName)).filter(Boolean));
  const exactClubMatch = (fullName: string) => (data?.clubPlayers ?? []).find((option) => playerNameMatchKind(fullName, option.name) === "exact");
  const checkNameWarning = (fullName: string) => {
    if (!fullName.trim()) return null;
    const clubPlayers = data?.clubPlayers ?? [];
    const exact = clubPlayers.find((option) => playerNameMatchKind(fullName, option.name) === "exact");
    if (exact?.selectedByOtherTeam) {
      setWarning(`${exact.name} has already been selected for ${exact.selectedByOtherTeam}. Choose another player or contact the League Secretary.`);
      return;
    }
    if (exact) return;
    const possible = clubPlayers.filter((option) => playerNameMatchKind(fullName, option.name) === "possible").slice(0, 3);
    if (possible.length > 0) setWarning(`Possible existing ${data?.team.locationName ?? "club"} player: ${possible.map((option) => option.name).join(", ")}. Check the spelling or select the existing player from the list.`);
  };
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
    setWarning(null);
  };

  const addAnotherPlayer = () => {
    const newPlayer = emptyPlayer();
    setPack((current) => ({ ...current, players: [...current.players, newPlayer] }));
    setLastAddedPlayerId(newPlayer.rowId);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const input = document.getElementById(`player-name-${newPlayer.rowId}`) as HTMLInputElement | null;
        input?.scrollIntoView({ behavior: "smooth", block: "center" });
        input?.focus({ preventScroll: true });
      });
    });
  };

  const save = async (action: "save" | "submit") => {
    if (action === "submit" && emailCopyRequested && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receiptEmail.trim())) {
      setError("Enter a valid email address if you would like a copy of the submission.");
      return;
    }
    setBusy(action);
    setError(null);
    setMessage(null);
    setWarning(null);
    const response = await fetch(`/api/public/entry-pack/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, pack, receiptEmail: action === "submit" && emailCopyRequested ? receiptEmail.trim() : "" }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setError(result?.error ?? "The team registration could not be saved.");
      return;
    }
    if (action === "submit" && emailCopyRequested) setReceiptStatus(result.receiptStatus === "sent" ? "sent" : "failed");
    setMessage(action === "submit" ? "Team registration submitted successfully. A league officer will review it." : "Draft saved. Return through the shared league-registration page on this browser to continue.");
    await load();
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetRegistration = async () => {
    const confirmed = await showConfirm({
      title: "Clear this registration?",
      description: "Every player and assigned role will be removed so the team can start again. This cannot be undone.",
      confirmLabel: "Clear registration",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusy("reset"); setError(null); setMessage(null); setWarning(null);
    const response = await fetch(`/api/public/entry-pack/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) return setError(result?.error ?? "The registration could not be cleared.");
    setMessage("The form has been cleared. You can now start the team registration again.");
    await load();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loading) return <main className="min-h-screen bg-slate-100 p-6"><p className="mx-auto max-w-5xl rounded-2xl bg-white p-5 text-slate-700 shadow-sm">Loading team registration…</p></main>;
  if (!data || error && !data) return <main className="min-h-screen bg-slate-100 p-6"><section className="mx-auto max-w-3xl rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900"><h1 className="text-xl font-bold">Team registration unavailable</h1><p className="mt-2">{error}</p></section></main>;

  if (data.pack.status === "submitted" || data.pack.status === "approved") {
    const approved = data.pack.status === "approved";
    return (
      <main className="flex min-h-screen items-center bg-slate-100 p-3 sm:p-6">
        <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-xl">
          <header className="bg-gradient-to-r from-slate-950 via-teal-950 to-slate-900 p-6 text-white sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300">Rack &amp; Frame · Team registration</p>
            <h1 className="mt-2 text-3xl font-black">{approved ? "Registration approved" : "Registration submitted"}</h1>
            <p className="mt-3 text-lg font-semibold">{data.team.name}</p>
            <p className="text-sm text-slate-300">{data.team.locationName} · {data.season.name}</p>
          </header>

          <div className="p-6 sm:p-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-3xl font-black text-emerald-700" aria-hidden="true">✓</div>
            <h2 className="mt-5 text-2xl font-black text-slate-950">
              {approved ? "This team registration has been approved." : "Thank you. Your team registration has been received."}
            </h2>
            <p className="mt-2 text-slate-700">
              {approved
                ? "The submitted roster has been checked and imported into Rack & Frame."
                : "A league officer will now check the player names and roles before importing the roster."}
            </p>

            {receiptStatus === "sent" ? (
              <p className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">A copy of the submitted roster has been emailed to {receiptEmail.trim()}.</p>
            ) : receiptStatus === "failed" ? (
              <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">The registration was submitted successfully, but the optional email copy could not be sent. A league officer can still review the submission.</p>
            ) : null}

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-bold text-slate-950">What happens next?</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {!approved ? <li>You do not need to submit this form again.</li> : null}
                <li>This registration is now closed for editing.</li>
                <li>Contact a league officer if anything needs changing.</li>
                <li>Captain and vice-captain access instructions will be supplied separately.</li>
              </ul>
            </div>

            <a href="/league-entry" className="mt-6 inline-flex rounded-xl bg-teal-700 px-5 py-3 font-bold text-white">
              Return to team selection
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-3 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <MessageModal message={error ?? warning} onClose={() => { setError(null); setWarning(null); }} />
        <header className="rounded-3xl bg-gradient-to-r from-slate-950 via-teal-950 to-slate-900 p-5 text-white shadow-xl sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300">Rack &amp; Frame · Team registration</p>
          <h1 className="mt-2 text-3xl font-black">Winter League Team Registration</h1>
          <p className="mt-2 text-lg font-semibold text-white">{data.team.name}</p>
          <p className="text-sm text-slate-300">{data.team.locationName} · {data.season.name}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold">No app account required</span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold">No private contact details requested</span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold">Status: {data.pack.status}</span>
          </div>
        </header>

        <nav className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><a href="/league-entry" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700">Back to team selection</a><button type="button" disabled={Boolean(busy)} onClick={() => void resetRegistration()} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-800 disabled:opacity-50">{busy === "reset" ? "Clearing…" : "Clear form and start again"}</button><span className="text-xs text-slate-500">Save your draft before going back if you want to keep your latest changes.</span></nav>

        {message ? <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 font-medium text-emerald-900">{message}</section> : null}
        {data.pack.status === "rejected" && data.pack.reviewNotes ? (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <p className="font-bold">Returned for correction</p><p className="mt-1 text-sm">{data.pack.reviewNotes}</p>
          </section>
        ) : null}
        <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">Instructions</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-800">
            <li>Complete the mandatory captain and vice-captain fields. Five optional player fields are ready to use, and <strong>Add another player</strong> is available for larger squads.</li>
            <li><strong>Existing player:</strong> choose their name from the club dropdown. <strong>New player:</strong> type their full first and second name in the new-player box.</li>
            <li>Use <strong>Save draft</strong> while collecting details. Submit only when the roster is complete.</li>
            <li>Knockout competition entry forms will be sent separately and are not part of this league registration.</li>
            <li>After submission, a league officer will check historic profiles before creating new players.</li>
            <li>The captain and vice-captain will later receive account-based team access for line-ups, fixture completion and results. A separate guide will be supplied before the season.</li>
          </ol>
          <p className="mt-3 rounded-xl bg-white p-3 text-xs text-slate-600">This registration does not collect private match-arranging telephone numbers or emails. Competition contact details are collected separately.</p>
        </section>

        <fieldset className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-xl font-bold text-slate-950">1. Team roster and roles</h2><p className="mt-1 text-sm text-slate-600">Captain and vice-captain are mandatory. The five additional player fields are optional.</p></div>
              <button type="button" onClick={addAnotherPlayer} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white">Add another blank player field</button>
            </div>
            <div className="mt-4 space-y-4">
              {pack.players.map((player, index) => (
                <article key={player.rowId} className={`rounded-2xl border p-4 ${lastAddedPlayerId === player.rowId ? "border-teal-400 bg-teal-50 ring-2 ring-teal-100" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex items-center justify-between gap-3"><div><h3 className="font-bold text-slate-900">{index === 0 ? "Captain" : index === 1 ? "Vice-captain" : `Player ${index - 1}`}</h3>{lastAddedPlayerId === player.rowId ? <p className="mt-1 text-xs font-bold text-teal-800">New blank player field added — type the player&apos;s full name below.</p> : null}</div>{index >= 7 ? <button type="button" onClick={() => { setPack((current) => ({ ...current, players: current.players.filter((row) => row.rowId !== player.rowId) })); if (lastAddedPlayerId === player.rowId) setLastAddedPlayerId(null); }} className="text-sm font-semibold text-rose-700">Remove</button> : null}</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-600"><span className="block text-teal-800">Option 1 — Existing club player</span><span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-slate-500">Choose a player already registered with {data.team.locationName}.</span><select value={data.clubPlayers.find((option) => normalizePlayerName(option.name) === normalizePlayerName(player.fullName))?.name ?? ""} onChange={(event) => updatePlayer(player.rowId, { fullName: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal"><option value="">Select an existing player…</option>{data.clubPlayers.map((option) => { const alreadyInThisRoster = selectedNames.has(normalizePlayerName(option.name)) && normalizePlayerName(option.name) !== normalizePlayerName(player.fullName); const unavailable = Boolean(option.selectedByOtherTeam) || alreadyInThisRoster; return <option key={option.id} value={option.name} disabled={unavailable}>{option.name}{option.selectedByOtherTeam ? ` — already selected for ${option.selectedByOtherTeam}` : alreadyInThisRoster ? " — already selected on this form" : ""}</option>; })}</select></label>
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-600"><span className="block text-indigo-800">Option 2 — New player {index < 2 ? "*" : "(optional)"}</span><span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-slate-500">If the player is not in the dropdown, type their full first and second name here.</span><input id={`player-name-${player.rowId}`} value={player.fullName} onChange={(event) => updatePlayer(player.rowId, { fullName: event.target.value })} onBlur={() => checkNameWarning(player.fullName)} placeholder="Type new player's full name" className="mt-2 w-full rounded-xl border border-indigo-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal" />{exactClubMatch(player.fullName) && !exactClubMatch(player.fullName)?.selectedByOtherTeam ? <span className="mt-2 block rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold normal-case tracking-normal text-emerald-800">Existing club player matched: {exactClubMatch(player.fullName)?.name}</span> : null}</label>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">2. Other team information</h2>
            <p className="mt-1 text-sm text-slate-600">Add any league-registration information the league officers should know.</p>
            <textarea value={pack.generalNotes} onChange={(event) => setPack({ ...pack, generalNotes: event.target.value })} rows={3} className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </section>

          <section className="rounded-2xl border border-teal-200 bg-teal-50 p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">3. Declaration and submission</h2>
            <div className="mt-3 space-y-3 text-sm text-slate-800">
              <label className="flex items-start gap-3 rounded-xl bg-white p-3"><input type="checkbox" className="mt-1" checked={pack.accuracyConfirmed} onChange={(event) => setPack({ ...pack, accuracyConfirmed: event.target.checked })} /><span>I confirm that the roster and captain roles are accurate and that the people listed know their details are being supplied.</span></label>
              <label className="flex items-start gap-3 rounded-xl bg-white p-3"><input type="checkbox" className="mt-1" checked={emailCopyRequested} onChange={(event) => { setEmailCopyRequested(event.target.checked); if (!event.target.checked) setReceiptEmail(""); }} /><span><strong>Email me a copy of this submission</strong><span className="mt-1 block text-xs text-slate-600">Optional. This address is used only to send the confirmation copy and is not added to any player profile or match-arranging contact record.</span></span></label>
              {emailCopyRequested ? <label className="block rounded-xl border border-teal-200 bg-white p-3 text-xs font-bold uppercase tracking-wide text-slate-600">Email address<input type="email" value={receiptEmail} onChange={(event) => setReceiptEmail(event.target.value)} placeholder="name@example.com" autoComplete="email" className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" /></label> : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={Boolean(busy)} onClick={() => void save("save")} className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-bold text-slate-800 disabled:opacity-50">{busy === "save" ? "Saving…" : "Save draft"}</button><button type="button" disabled={Boolean(busy)} onClick={() => void save("submit")} className="rounded-xl bg-teal-700 px-5 py-3 font-bold text-white disabled:opacity-50">{busy === "submit" ? "Submitting…" : "Submit completed registration"}</button></div>
          </section>
        </fieldset>
      </div>
    </main>
  );
}
