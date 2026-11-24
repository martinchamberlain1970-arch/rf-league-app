"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import MessageModal from "@/components/MessageModal";
import { supabase } from "@/lib/supabase";
import useAdminStatus from "@/components/useAdminStatus";
import { competitionDeadlineLabel, competitionEntriesOpen, usesFixedCompetitionHandicaps } from "@/lib/fixed-competition-handicaps";
import { competitionAgeRule, groupTeamCompetitionEntries } from "@/lib/public-competition-entry";
import { fetchAllSupabasePages } from "@/lib/supabase-pagination";

type Competition = {
  id: string;
  name: string;
  sport_type: "snooker" | "billiards";
  competition_format: "knockout" | "league";
  match_mode: "singles" | "doubles";
  location_id: string | null;
  signup_open: boolean;
  signup_deadline: string | null;
  max_entries: number | null;
  is_archived: boolean;
  is_completed: boolean;
};

type Entry = {
  id: string;
  competition_id: string;
  requester_user_id: string | null;
  player_id: string;
  entrant_date_of_birth?: string | null;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  created_at: string;
  reviewed_at: string | null;
  note: string | null;
};

type Player = { id: string; display_name: string; full_name: string | null };
type Location = { id: string; name: string };
type TeamEntryNote = { teamMemberNames?: string[] };

function isHodgeCompetitionName(name: string) {
  return name === "Hodge Cup (Triples)" || name.startsWith("Hodge Cup (Triples) - ");
}

function isAlberyCompetitionName(name: string) {
  return name === "Albery Cup (Billiards 3-Man Team)" || name.startsWith("Albery Cup (Billiards 3-Man Team) - ");
}

function requiredEntrants(c: Competition) {
  if (isHodgeCompetitionName(c.name) || isAlberyCompetitionName(c.name)) return 3;
  if (c.match_mode === "doubles") return 2;
  return 1;
}

function parseTeamNote(note: string | null): TeamEntryNote {
  if (!note) return {};
  try {
    const parsed = JSON.parse(note) as TeamEntryNote;
    return parsed && Array.isArray(parsed.teamMemberNames) ? parsed : {};
  } catch {
    return {};
  }
}

export default function CompetitionSignupsPage() {
  const admin = useAdminStatus();
  const [message, setMessage] = useState<string | null>(null);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [teamNames, setTeamNames] = useState<Map<string, string>>(new Map());
  const [confirmForm, setConfirmForm] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const playerNameMap = useMemo(() => new Map(players.map((p) => [p.id, p.full_name?.trim() ? p.full_name : p.display_name])), [players]);
  const locationNameMap = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations]);
  const competitionNames = useMemo(() => new Map(competitions.map((competition) => [competition.id, competition.name])), [competitions]);
  const pendingForms = useMemo(() => groupTeamCompetitionEntries(
    entries.filter((entry) => entry.status === "pending" && competitionNames.has(entry.competition_id)),
  ).forms, [entries, competitionNames]);
  const reload = async () => {
    const client = supabase;
    if (!client) {
      setMessage("Supabase is not configured.");
      return;
    }
    const authRes = await client.auth.getUser();
    const uid = authRes.data.user?.id ?? null;
    setUserId(uid);
    if (!uid) return;

    const [compRes, entryResWithDob, playerRes, locationRes] = await Promise.all([
      client
        .from("competitions")
        .select("id,name,sport_type,competition_format,match_mode,location_id,signup_open,signup_deadline,max_entries,is_archived,is_completed")
        .eq("is_archived", false)
        .eq("is_completed", false)
        .order("name"),
      fetchAllSupabasePages<Entry>((from, to) =>
        client
          .from("competition_entries")
          .select("id,competition_id,requester_user_id,player_id,entrant_date_of_birth,status,created_at,reviewed_at,note")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to)
      ),
      fetchAllSupabasePages<Player>((from, to) =>
        client.from("players").select("id,display_name,full_name").order("id", { ascending: true }).range(from, to)
      ),
      client.from("locations").select("id,name"),
    ]);
    let entryRows: Entry[] = [];
    if (entryResWithDob.error && entryResWithDob.error.message.toLowerCase().includes("entrant_date_of_birth")) {
      const entryResFallback = await fetchAllSupabasePages<Entry>((from, to) =>
        client
          .from("competition_entries")
          .select("id,competition_id,requester_user_id,player_id,status,created_at,reviewed_at,note")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to)
      );
      if (entryResFallback.error) {
        setMessage(compRes.error?.message || entryResFallback.error?.message || playerRes.error?.message || locationRes.error?.message || "Failed to load sign-ups.");
        return;
      }
      entryRows = (entryResFallback.data ?? []) as Entry[];
    } else if (entryResWithDob.error) {
      setMessage(compRes.error?.message || entryResWithDob.error?.message || playerRes.error?.message || locationRes.error?.message || "Failed to load sign-ups.");
      return;
    } else {
      entryRows = (entryResWithDob.data ?? []) as Entry[];
    }

    if (compRes.error || playerRes.error || locationRes.error) {
      setMessage(compRes.error?.message || playerRes.error?.message || locationRes.error?.message || "Failed to load sign-ups.");
      return;
    }
    const formTeamIds = [...new Set(groupTeamCompetitionEntries(entryRows.filter((entry) => entry.status === "pending")).forms.map((form) => form.teamId))];
    if (formTeamIds.length) {
      const teams = await client.from("league_teams").select("id,name").in("id", formTeamIds);
      setTeamNames(new Map((teams.data ?? []).map(({ id, name }) => [id, name])));
    } else {
      setTeamNames(new Map());
    }
    setCompetitions((compRes.data ?? []) as Competition[]);
    setEntries(entryRows);
    setPlayers(playerRes.data ?? []);
    setLocations((locationRes.data ?? []) as Location[]);
  };

  useEffect(() => {
    void reload();
  }, []);

  const reviewEntries = async (entryIds: string[], status: "approved" | "rejected", actionId: string) => {
    const client = supabase;
    if (!client || !entryIds.length) return;
    if (!admin.canManageLeague || !admin.userId) {
      setMessage("League officer access is required to review competition entries.");
      return;
    }
    setConfirmForm(null);
    setBusyId(actionId);
    try {
      const { data, error } = await client
        .from("competition_entries")
        .update({ status, reviewed_by_user_id: admin.userId, reviewed_at: new Date().toISOString() })
        .in("id", entryIds)
        .eq("status", "pending")
        .select("id");
      if (error) throw error;
      if (!data.length) setMessage("These entries are no longer pending.");
      else if (entryIds.length > 1) setMessage(`${data.length} competition ${data.length === 1 ? "entry" : "entries"} approved.`);
      await reload();
    } catch (error) {
      setMessage(error && typeof error === "object" && "message" in error ? String(error.message) : "The entries could not be reviewed.");
    } finally {
      setBusyId(null);
    }
  };

  const reviewEntry = (entryId: string, status: "approved" | "rejected") => reviewEntries([entryId], status, entryId);

  const withdrawEntry = async (entryId: string) => {
    const client = supabase;
    if (!client) return;
    setBusyId(entryId);
    const res = await client.from("competition_entries").update({ status: "withdrawn" }).eq("id", entryId);
    if (res.error) setMessage(res.error.message);
    setBusyId(null);
    await reload();
  };

  const visibleCompetitions = competitions.filter((competition) => competition.signup_open ||
    (admin.canManageLeague && entries.some((entry) => entry.competition_id === competition.id && entry.status === "pending"))
  );

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <RequireAuth>
          <ScreenHeader title="Competition Entries" eyebrow="Competitions" subtitle="View competitions and track entry approval."
            actions={admin.canManageLeague ? (
              <Link href="/competition-submissions" className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold">
                Team form submissions
              </Link>
            ) : null}
          />
          <MessageModal message={message} onClose={() => setMessage(null)} />

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">
              Ask your captain to include you in the team’s entry. League officers review submitted entries here.
            </p>
            <Link href="/competition-entry" className="mt-3 inline-block font-semibold text-teal-800 underline">
              Open the captains’ entry form
            </Link>
          </section>

          {admin.canManageLeague ? (
            <section id="team-form-approvals" className="scroll-mt-28 rounded-2xl border border-teal-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">Team forms awaiting approval</h2>
              {pendingForms.length ? (
                <div className="mt-3 space-y-3">
                  {pendingForms.map((form) => {
                    const teamName = teamNames.get(form.teamId) ?? "Team";
                    return (
                      <details key={form.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <summary className="cursor-pointer font-semibold text-slate-900">
                          {teamName} · {form.entries.length} pending {form.entries.length === 1 ? "entry" : "entries"}
                        </summary>
                        <ul className="mt-2 divide-y divide-slate-200">
                          {form.entries.map((entry) => (
                            <li key={entry.id} className="py-2 text-sm">
                              <strong className="text-slate-800">{competitionNames.get(entry.competition_id)}</strong>
                              <p className="text-slate-600">
                                {[playerNameMap.get(entry.player_id) ?? "Unknown player", ...(parseTeamNote(entry.note).teamMemberNames ?? [])].join(" & ")}
                              </p>
                            </li>
                          ))}
                        </ul>
                        {confirmForm === form.id ? (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <p className="text-sm text-slate-700">Approve all {form.entries.length} pending entries from this form?</p>
                            <button type="button" disabled={busyId !== null} onClick={() => void reviewEntries(form.entries.map(({ id }) => id), "approved", form.id)} className="rounded-lg bg-teal-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                              Confirm approval
                            </button>
                            <button type="button" onClick={() => setConfirmForm(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Cancel</button>
                          </div>
                        ) : (
                          <button type="button" disabled={busyId !== null} onClick={() => setConfirmForm(form.id)} className="mt-3 rounded-lg bg-teal-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                            {busyId === form.id ? "Approving…" : "Approve all pending entries"}
                          </button>
                        )}
                      </details>
                    );
                  })}
                </div>
              ) : <p className="mt-2 text-sm text-slate-600">No team forms are awaiting approval.</p>}
            </section>
          ) : null}

          <section className="space-y-3">
            {visibleCompetitions.map((c) => {
              const userEntry = entries.find((e) => e.competition_id === c.id && e.requester_user_id === userId);
              const allEntries = entries.filter((e) => e.competition_id === c.id && e.status !== "withdrawn");
              const approvedCount = allEntries.filter((e) => e.status === "approved").length;
              const pendingCount = allEntries.filter((e) => e.status === "pending").length;
              const deadlinePassed = !competitionEntriesOpen(c.signup_deadline);
              const full = c.max_entries ? approvedCount >= c.max_entries : false;
              const isAlreadyEntered = userEntry?.status === "approved";
              const ageRule = competitionAgeRule(c.name);
              const entrantsRequired = requiredEntrants(c);
              return (
                <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-semibold text-slate-900">{c.name}</p>
                      <p className="text-sm text-slate-600">
                        {(isAlberyCompetitionName(c.name) ? "Billiards" : c.sport_type === "billiards" ? "Billiards" : "Snooker")} · {entrantsRequired === 3 ? "Triples" : c.match_mode === "doubles" ? "Doubles" : "Singles"} · {c.competition_format}
                        {c.location_id ? ` · ${locationNameMap.get(c.location_id) ?? "Location"}` : ""}
                      </p>
                      <p className="text-xs text-slate-500">
                        Approved: {approvedCount}
                        {c.max_entries ? ` / ${c.max_entries}` : ""} · Pending: {pendingCount}
                        {c.signup_deadline ? ` · Deadline: ${competitionDeadlineLabel(c.signup_deadline)} (UK time)` : ""}
                        {usesFixedCompetitionHandicaps(c.name) ? " · Fixed at entry close · Division One Elo +8" : ""}
                      </p>
                    </div>
                    <Link href={`/competitions/${c.id}`} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50">
                      View Event
                    </Link>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {userEntry ? (
                      <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                        Your status: {userEntry.status}
                      </span>
                    ) : null}
                    {isAlreadyEntered ? (
                      <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                        Entered
                      </span>
                    ) : null}
                    {!admin.isSuper && userEntry && (userEntry.status === "pending" || userEntry.status === "approved") ? (
                      <button
                        type="button"
                        disabled={busyId === userEntry.id}
                        onClick={() => void withdrawEntry(userEntry.id)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        {busyId === userEntry.id ? "Withdrawing..." : "Withdraw"}
                      </button>
                    ) : null}
                    {deadlinePassed ? <span className="text-xs text-rose-700">Deadline passed</span> : null}
                    {full ? <span className="text-xs text-rose-700">Competition full</span> : null}
                    {ageRule.minimum !== null ? <span className="text-xs text-slate-600">Eligibility: age {ageRule.minimum}+</span> : null}
                    {ageRule.maximum !== null ? <span className="text-xs text-slate-600">Eligibility: under 25</span> : null}
                    {entrantsRequired === 2 ? <span className="text-xs text-slate-600">Entry requires 2 players.</span> : null}
                    {entrantsRequired === 3 ? <span className="text-xs text-slate-600">Entry requires 3 players.</span> : null}
                  </div>

                  {admin.isAdmin && allEntries.length > 0 ? (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-2 text-sm font-semibold text-slate-800">Entries</p>
                      <div className="space-y-1 text-sm">
                        {allEntries.map((e) => (
                          <div key={e.id} className="flex flex-wrap items-center justify-between gap-2">
                            {(() => {
                              const note = parseTeamNote(e.note);
                              const teamNames = (note.teamMemberNames ?? []).filter((n) => String(n ?? "").trim().length > 0);
                              return (
                            <span className="text-slate-700">
                              {playerNameMap.get(e.player_id) ?? "Unknown player"}
                              {teamNames.length > 0 ? ` + ${teamNames.join(" + ")}` : ""}
                              {e.entrant_date_of_birth ? ` · DOB ${new Date(e.entrant_date_of_birth).toLocaleDateString()}` : ""}
                            </span>
                              );
                            })()}
                            <div className="flex items-center gap-2">
                              <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600">{e.status}</span>
                              {admin.canManageLeague && e.status === "pending" ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={busyId !== null}
                                    onClick={() => void reviewEntry(e.id, "approved")}
                                    className="rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyId !== null}
                                    onClick={() => void reviewEntry(e.id, "rejected")}
                                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
                                  >
                                    Reject
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!visibleCompetitions.length ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-600 shadow-sm">
                No competitions are currently open for sign-up.
              </div>
            ) : null}
          </section>
        </RequireAuth>
      </div>
    </main>
  );
}
