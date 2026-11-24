"use client";

import { competitionDeadlineLabel, usesFixedCompetitionHandicaps } from "@/lib/fixed-competition-handicaps";
import { useEffect, useMemo, useRef, useState } from "react";
import { ageFromDob, competitionAgeRule, entrantsRequired, maySelectCompetitionPlayer, selectedPlayerCounts, type PublicCompetition, type PublicCompetitionEntry, type PublicCompetitionPartner, type PublicCompetitionPlayer, type PublicCompetitionReceipt, type PublicCompetitionSelection } from "@/lib/public-competition-entry";

type Team = { id: string; name: string; season_id: string };
const makeToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, "0")).join("");
const makeEntry = (count: number): PublicCompetitionEntry => ({ entryId: crypto.randomUUID(), playerIds: Array.from({ length: count }, () => ""), entrantDateOfBirth: "" });

function SubmittedEntries({ receipt }: { receipt: PublicCompetitionReceipt }) {
  return (
    <section className="rounded-2xl border border-emerald-300 bg-white p-5 print:border-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-emerald-900">Submitted entries · {receipt.teamName}</h2>
          {receipt.submittedAt ? <p className="mt-1 text-sm text-slate-600">Submitted {competitionDeadlineLabel(receipt.submittedAt)} (UK time)</p> : null}
          <p className="mt-2 text-sm text-slate-700">Keep this copy for your records. You can reopen it on the same browser.</p>
        </div>
        <button type="button" onClick={() => window.print()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold print:hidden">Print or save as PDF</button>
      </div>
      <dl className="mt-4 divide-y divide-slate-200">
        {receipt.competitions.map(({ name, groups }, index) => (
          <div key={index} className="py-3 sm:grid sm:grid-cols-[1fr_1fr] sm:gap-4">
            <dt className="font-semibold text-slate-900">{name}</dt>
            <dd className="mt-1 text-sm text-slate-700 sm:mt-0">
              {groups.length ? <ul>{groups.map((group, index) => <li key={index}>{group.join(" & ")}</li>)}</ul> : "No entry"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function PublicCompetitionEntryPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [competitions, setCompetitions] = useState<PublicCompetition[]>([]);
  const rosterRequest = useRef<AbortController | null>(null);
  const [partners, setPartners] = useState<PublicCompetitionPartner[]>([]);
  const [players, setPlayers] = useState<PublicCompetitionPlayer[]>([]);
  const [teamId, setTeamId] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [selections, setSelections] = useState<PublicCompetitionSelection[]>([]);
  const [draftToken, setDraftToken] = useState("");
  const [receipt, setReceipt] = useState<PublicCompetitionReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const mergeSelections = (comps: PublicCompetition[], saved: PublicCompetitionSelection[] = []): PublicCompetitionSelection[] => {
    const byId = new Map(saved.map((item) => [item.competitionId, item]));
    return comps.map((competition) => byId.get(competition.id) ?? { competitionId: competition.id, decision: "pending" as const, entries: [] });
  };

  useEffect(() => {
    const initialise = async () => {
      const stored = localStorage.getItem("rf-competition-draft-token") || makeToken();
      localStorage.setItem("rf-competition-draft-token", stored);
      setDraftToken(stored);
      const base = await fetch(`/api/public/competition-entry-form?draftToken=${stored}`, { cache: "no-store" });
      const result = await base.json();
      if (!base.ok) return setMessage(result.error ?? "Form could not be loaded.");
      if (result.receipt) return setReceipt(result.receipt);
      setTeams(result.teams ?? []); setCompetitions(result.competitions ?? []);
      const savedTeam = result.draft?.team_id ?? "";
      const savedContactName = result.draft?.contact_name ?? "";
      setTeamId(savedTeam); setContactName(savedContactName); setContactPhone(result.draft?.contact_phone ?? "");
      setSelections(mergeSelections(result.competitions ?? [], result.draft?.selections ?? []));
      if (savedTeam) {
        const roster = await fetch(`/api/public/competition-entry-form?teamId=${savedTeam}`, { cache: "no-store" });
        const rosterResult = await roster.json();
        if (roster.ok) {
          setPlayers(rosterResult.players ?? []);
          setPartners(rosterResult.partners ?? []);
          if (!savedContactName) setContactName(rosterResult.captainName ?? "");
        }
      }
    };
    void initialise().catch(() => setMessage("The competition form could not be loaded. Refresh to try again.")).finally(() => setLoading(false));
  }, []);

  const changeTeam = async (id: string) => {
    rosterRequest.current?.abort();
    setTeamId(id); setPlayers([]); setPartners([]); setMessage(""); setContactName("");
    setSelections(mergeSelections(competitions));
    if (!id) return;
    const controller = new AbortController();
    rosterRequest.current = controller;
    try {
      const response = await fetch(`/api/public/competition-entry-form?teamId=${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) return setMessage(result.error ?? "Team roster could not be loaded.");
      setPlayers(result.players ?? []);
      setPartners(result.partners ?? []);
      setContactName(result.captainName ?? "");
    } catch {
      if (!controller.signal.aborted) setMessage("Team roster could not be loaded. Select the team again to retry.");
    }
  };

  const update = (competitionId: string, fn: (value: PublicCompetitionSelection) => PublicCompetitionSelection) => setSelections((current) => current.map((item) => item.competitionId === competitionId ? fn(item) : item));
  const complete = useMemo(() => selections.filter((item) => item.decision !== "pending" && (item.decision === "no_entry" || item.entries.length > 0)).length, [selections]);

  const countsByCompetition = useMemo(() => new Map(selections
    .filter(({ decision }) => decision === "enter")
    .map(({ competitionId, entries }) => [competitionId, selectedPlayerCounts(entries)])), [selections]);
  const duplicates = [...countsByCompetition.values()].some((counts) => [...counts.values()].some((count) => count > 1));

  const selectPlayer = (competitionId: string, entryId: string, slot: number, playerId: string) => {
    update(competitionId, (current) => {
      const entry = current.entries.find((item) => item.entryId === entryId);
      if (!entry || !maySelectCompetitionPlayer(playerId, entry.playerIds[slot] ?? "", selectedPlayerCounts(current.entries))) {
        return current;
      }
      const playerIds = [...entry.playerIds];
      playerIds[slot] = playerId;
      return {
        ...current,
        entries: current.entries.map((item) => item.entryId === entryId
          ? { ...item, playerIds, entrantDateOfBirth: slot === 0 ? "" : item.entrantDateOfBirth }
          : item),
      };
    });
  };

  const save = async (action: "save" | "submit") => {
    setBusy(true); setMessage("");
    const response = await fetch("/api/public/competition-entry-form", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, draftToken, teamId, contactName, contactPhone, selections }) });
    const result = await response.json(); setBusy(false);
    if (!response.ok) return setMessage(result.error ?? "Form could not be saved.");
    if (action === "submit" && result.receipt) setReceipt(result.receipt);
    setMessage(action === "submit" ? `Competition entries submitted successfully${result.created ? ` (${result.created} sent for approval)` : ""}.` : "Draft saved privately. Return on this browser to continue.");
  };

  return <main className="min-h-screen bg-slate-100 p-3 sm:p-6"><div className="mx-auto max-w-5xl space-y-4">
    <header className="rounded-3xl bg-gradient-to-r from-slate-950 via-teal-950 to-slate-900 p-6 text-white shadow-xl"><p className="text-xs font-bold uppercase tracking-[.2em] text-teal-300">Rack &amp; Frame</p><h1 className="mt-2 text-3xl font-black">Competition Entry Form</h1><p className="mt-2 text-slate-300">One form for every team. Select your team, complete each competition and save as often as needed.</p></header>
    <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 print:hidden">Captains submit one form per team. For doubles and three-player events, choose the first player from your team and any partners from the same club. Partners can play for different teams or divisions.</p>
    {message ? <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm font-semibold text-sky-900 print:hidden">{message}</div> : null}
    {receipt ? <SubmittedEntries receipt={receipt} /> : loading ? <p>Loading competitions…</p> : competitions.length === 0 ? <p className="rounded-2xl bg-white p-5">Competition entries are currently closed.</p> : <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">1. Team and contact</h2><div className="mt-3 grid gap-3 md:grid-cols-3"><label className="text-sm font-bold">Team *<select value={teamId} onChange={(event) => void changeTeam(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal"><option value="">Select your team…</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label className="text-sm font-bold">Captain / contact name *<input value={contactName} onChange={(event) => setContactName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label><label className="text-sm font-bold">Telephone *<input type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label></div>{teamId && players.length === 0 ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">This team has no registered players yet. Complete and approve its league welcome pack before entering competitions.</p> : null}</section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">2. Competition entries</h2><p className="text-sm text-slate-600">Choose Enter or No entry for every competition.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{complete}/{competitions.length} completed</span></div><div className="mt-4 space-y-4">{competitions.map((competition) => { const selection = selections.find((item) => item.competitionId === competition.id); if (!selection) return null; const required = entrantsRequired(competition); const ageRule = competitionAgeRule(competition.name); const ageRestricted = ageRule.minimum !== null || ageRule.maximum !== null;
        const counts = countsByCompetition.get(competition.id) ?? new Map<string, number>();
        const repeatedPlayers = [...counts].filter(([, count]) => count > 1)
          .map(([id]) => partners.find((player) => player.id === id)?.name ?? players.find((player) => player.id === id)?.name ?? "Unknown player");
        return <article key={competition.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><h3 className="font-bold">{competition.name}</h3><p className="text-xs text-slate-500">{required === 1 ? "Singles" : required === 2 ? "Doubles" : "Three-player team"}{competition.signup_deadline ? ` · closes ${competitionDeadlineLabel(competition.signup_deadline)}` : ""} (UK time)</p>{usesFixedCompetitionHandicaps(competition.name) ? <p className="mt-2 text-sm text-teal-900">Handicaps are set when entries close and stay fixed throughout. Division One players use their Elo-suggested handicap plus 8 points. Premier players use their published handicap.</p> : null}<select value={selection.decision} onChange={(event) => update(competition.id, (current) => ({ ...current, decision: event.target.value as PublicCompetitionSelection["decision"], entries: event.target.value === "enter" ? (current.entries.length ? current.entries : [makeEntry(required)]) : [] }))} className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2"><option value="pending">Choose…</option><option value="enter">Enter player(s)</option><option value="no_entry">No entry</option></select>{selection.decision === "enter" ? <div className="mt-3 space-y-3">
          {repeatedPlayers.length ? (
            <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Each player can appear once in this competition. Remove or change the extra entries for {repeatedPlayers.join(", ")}.
            </p>
          ) : null}
          {selection.entries.map((entry, entryIndex) => {
          const ageEligibility = players.find((player) => player.id === entry.playerIds[0])?.ageEligibility?.[competition.id];
          const ageRequirement = ageRule.maximum !== null ? "Must be under 25" : `Must be ${ageRule.minimum}+`;
          return <div key={entry.entryId} className="rounded-xl bg-white p-3"><div className="flex justify-between"><strong className="text-sm">Entry {entryIndex + 1}</strong>{selection.entries.length > 1 ? <button type="button" onClick={() => update(competition.id, (current) => ({ ...current, entries: current.entries.filter((item) => item.entryId !== entry.entryId) }))} className="text-xs font-bold text-rose-700">Remove</button> : null}</div><div className="mt-2 grid gap-2 md:grid-cols-3">{Array.from({ length: required }, (_, index) => {
              const selected = entry.playerIds[index] ?? "";
              const label = index === 0 ? "Player from your team" : `Club partner ${index}`;
              const options = index === 0 ? players : partners;
              return (
                <select
                  key={index}
                  aria-label={`Entry ${entryIndex + 1} · ${label}`}
                  value={selected}
                  onChange={(event) => selectPlayer(competition.id, entry.entryId, index, event.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="">{label}…</option>
                  {options.filter((player) => maySelectCompetitionPlayer(player.id, selected, counts)).map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}{"teamNames" in player && player.teamNames.length ? ` · ${player.teamNames.join(" / ")}` : ""}
                    </option>
                  ))}
                </select>
              );
            })}
            {ageRestricted && entry.playerIds[0] ? ageEligibility ? (
              <p role="status" className={ageEligibility === "eligible"
                ? "rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
                : "rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"}>
                {ageEligibility === "eligible" ? "Age eligibility verified from player profile." : `Player does not meet the age requirement. ${ageRequirement}.`}
              </p>
            ) : <label className="text-xs font-bold">Entrant DOB *<input type="date" value={entry.entrantDateOfBirth} onChange={(event) => update(competition.id, (current) => ({ ...current, entries: current.entries.map((item) => item.entryId === entry.entryId ? { ...item, entrantDateOfBirth: event.target.value } : item) }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /><span className="block font-normal text-slate-500">{entry.entrantDateOfBirth ? `Age ${ageFromDob(entry.entrantDateOfBirth) ?? "invalid"}` : ageRequirement}</span></label> : null}</div></div>; })}<button type="button" onClick={() => update(competition.id, (current) => ({ ...current, entries: [...current.entries, makeEntry(required)] }))} className="rounded-lg border border-teal-300 bg-white px-3 py-2 text-sm font-bold text-teal-800">Add another entry</button></div> : null}</article>; })}</div></section>
      <section className="rounded-2xl border border-teal-200 bg-teal-50 p-5"><h2 className="text-xl font-bold">3. Save or submit</h2><p className="mt-1 text-sm text-slate-700">Drafts are private to this browser. Submit only after all {competitions.length} competitions have been completed.</p><div className="mt-4 flex gap-3"><button type="button" disabled={busy || !teamId} onClick={() => void save("save")} className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-bold disabled:opacity-50">Save draft</button><button type="button" disabled={busy || !teamId || duplicates || complete !== competitions.length} onClick={() => void save("submit")} className="rounded-xl bg-teal-700 px-5 py-3 font-bold text-white disabled:opacity-50">Submit completed form</button></div></section>
    </>}
  </div></main>;
}
