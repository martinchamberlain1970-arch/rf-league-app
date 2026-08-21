"use client";

import { useEffect, useMemo, useState } from "react";
import { ageFromDob, entrantsRequired, minimumAge, type PublicCompetition, type PublicCompetitionEntry, type PublicCompetitionSelection } from "@/lib/public-competition-entry";

type Team = { id: string; name: string; season_id: string };
type Player = { id: string; name: string };
const makeToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, "0")).join("");
const makeEntry = (count: number): PublicCompetitionEntry => ({ entryId: crypto.randomUUID(), playerIds: Array.from({ length: count }, () => ""), entrantDateOfBirth: "" });

export default function PublicCompetitionEntryPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [competitions, setCompetitions] = useState<PublicCompetition[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teamId, setTeamId] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [selections, setSelections] = useState<PublicCompetitionSelection[]>([]);
  const [draftToken, setDraftToken] = useState("");
  const [status, setStatus] = useState<"draft" | "submitted">("draft");
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
      setTeams(result.teams ?? []); setCompetitions(result.competitions ?? []);
      const savedTeam = result.draft?.team_id ?? "";
      setTeamId(savedTeam); setContactName(result.draft?.contact_name ?? ""); setContactPhone(result.draft?.contact_phone ?? ""); setStatus(result.draft?.status ?? "draft");
      setSelections(mergeSelections(result.competitions ?? [], result.draft?.selections ?? []));
      if (savedTeam) {
        const roster = await fetch(`/api/public/competition-entry-form?teamId=${savedTeam}`, { cache: "no-store" });
        const rosterResult = await roster.json();
        if (roster.ok) setPlayers(rosterResult.players ?? []);
      }
    };
    void initialise();
  }, []);

  const changeTeam = async (id: string) => {
    setTeamId(id); setPlayers([]); setMessage("");
    setSelections(mergeSelections(competitions));
    if (!id) return;
    const response = await fetch(`/api/public/competition-entry-form?teamId=${id}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) return setMessage(result.error ?? "Team roster could not be loaded.");
    setPlayers(result.players ?? []);
  };

  const update = (competitionId: string, fn: (value: PublicCompetitionSelection) => PublicCompetitionSelection) => setSelections((current) => current.map((item) => item.competitionId === competitionId ? fn(item) : item));
  const complete = useMemo(() => selections.filter((item) => item.decision !== "pending" && (item.decision === "no_entry" || item.entries.length > 0)).length, [selections]);

  const save = async (action: "save" | "submit") => {
    setBusy(true); setMessage("");
    const response = await fetch("/api/public/competition-entry-form", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, draftToken, teamId, contactName, contactPhone, selections }) });
    const result = await response.json(); setBusy(false);
    if (!response.ok) return setMessage(result.error ?? "Form could not be saved.");
    if (action === "submit") setStatus("submitted");
    setMessage(action === "submit" ? `Competition entries submitted successfully${result.created ? ` (${result.created} sent for approval)` : ""}.` : "Draft saved privately. Return on this browser to continue.");
  };

  return <main className="min-h-screen bg-slate-100 p-3 sm:p-6"><div className="mx-auto max-w-5xl space-y-4">
    <header className="rounded-3xl bg-gradient-to-r from-slate-950 via-teal-950 to-slate-900 p-6 text-white shadow-xl"><p className="text-xs font-bold uppercase tracking-[.2em] text-teal-300">Rack &amp; Frame</p><h1 className="mt-2 text-3xl font-black">Competition Entry Form</h1><p className="mt-2 text-slate-300">One form for every team. Select your team, complete each competition and save as often as needed.</p></header>
    {message ? <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm font-semibold text-sky-900">{message}</div> : null}
    {status === "submitted" ? <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-900"><h2 className="font-bold">Form submitted</h2><p className="mt-1 text-sm">The entries are now awaiting league-officer approval.</p></section> : <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">1. Team and contact</h2><div className="mt-3 grid gap-3 md:grid-cols-3"><label className="text-sm font-bold">Team *<select value={teamId} onChange={(event) => void changeTeam(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal"><option value="">Select your team…</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label className="text-sm font-bold">Captain / contact name *<input value={contactName} onChange={(event) => setContactName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label><label className="text-sm font-bold">Telephone *<input type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label></div>{teamId && players.length === 0 ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">This team has no registered players yet. Complete and approve its league welcome pack before entering competitions.</p> : null}</section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">2. Competition entries</h2><p className="text-sm text-slate-600">Choose Enter or No entry for every competition.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{complete}/{competitions.length} completed</span></div><div className="mt-4 space-y-4">{competitions.map((competition) => { const selection = selections.find((item) => item.competitionId === competition.id); if (!selection) return null; const required = entrantsRequired(competition); const min = minimumAge(competition.name); return <article key={competition.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><h3 className="font-bold">{competition.name}</h3><p className="text-xs text-slate-500">{required === 1 ? "Singles" : required === 2 ? "Doubles" : "Three-player team"}{competition.signup_deadline ? ` · closes ${new Date(`${competition.signup_deadline}T12:00:00`).toLocaleDateString("en-GB")}` : ""}</p><select value={selection.decision} onChange={(event) => update(competition.id, (current) => ({ ...current, decision: event.target.value as PublicCompetitionSelection["decision"], entries: event.target.value === "enter" ? (current.entries.length ? current.entries : [makeEntry(required)]) : [] }))} className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2"><option value="pending">Choose…</option><option value="enter">Enter player(s)</option><option value="no_entry">No entry</option></select>{selection.decision === "enter" ? <div className="mt-3 space-y-3">{selection.entries.map((entry, entryIndex) => <div key={entry.entryId} className="rounded-xl bg-white p-3"><div className="flex justify-between"><strong className="text-sm">Entry {entryIndex + 1}</strong>{selection.entries.length > 1 ? <button type="button" onClick={() => update(competition.id, (current) => ({ ...current, entries: current.entries.filter((item) => item.entryId !== entry.entryId) }))} className="text-xs font-bold text-rose-700">Remove</button> : null}</div><div className="mt-2 grid gap-2 md:grid-cols-3">{Array.from({ length: required }, (_, index) => <select key={index} value={entry.playerIds[index] ?? ""} onChange={(event) => update(competition.id, (current) => ({ ...current, entries: current.entries.map((item) => item.entryId === entry.entryId ? { ...item, playerIds: Array.from({ length: required }, (_, slot) => slot === index ? event.target.value : item.playerIds[slot] ?? "") } : item) }))} className="rounded-lg border border-slate-300 px-3 py-2"><option value="">Player {index + 1}…</option>{players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select>)}{min ? <label className="text-xs font-bold">Entrant DOB *<input type="date" value={entry.entrantDateOfBirth} onChange={(event) => update(competition.id, (current) => ({ ...current, entries: current.entries.map((item) => item.entryId === entry.entryId ? { ...item, entrantDateOfBirth: event.target.value } : item) }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /><span className="block font-normal text-slate-500">{entry.entrantDateOfBirth ? `Age ${ageFromDob(entry.entrantDateOfBirth) ?? "invalid"}` : `Must be ${min}+`}</span></label> : null}</div></div>)}<button type="button" onClick={() => update(competition.id, (current) => ({ ...current, entries: [...current.entries, makeEntry(required)] }))} className="rounded-lg border border-teal-300 bg-white px-3 py-2 text-sm font-bold text-teal-800">Add another entry</button></div> : null}</article>; })}</div></section>
      <section className="rounded-2xl border border-teal-200 bg-teal-50 p-5"><h2 className="text-xl font-bold">3. Save or submit</h2><p className="mt-1 text-sm text-slate-700">Drafts are private to this browser. Submit only after all {competitions.length} competitions have been completed.</p><div className="mt-4 flex gap-3"><button type="button" disabled={busy || !teamId} onClick={() => void save("save")} className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-bold disabled:opacity-50">Save draft</button><button type="button" disabled={busy || !teamId || complete !== competitions.length} onClick={() => void save("submit")} className="rounded-xl bg-teal-700 px-5 py-3 font-bold text-white disabled:opacity-50">Submit completed form</button></div></section>
    </>}
  </div></main>;
}
