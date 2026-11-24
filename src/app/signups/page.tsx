"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import MessageModal from "@/components/MessageModal";
import { supabase } from "@/lib/supabase";
import useAdminStatus from "@/components/useAdminStatus";
import { competitionDeadlineLabel, competitionEntriesOpen, usesFixedCompetitionHandicaps } from "@/lib/fixed-competition-handicaps";
import { competitionAgeRule } from "@/lib/public-competition-entry";
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
  requester_user_id: string;
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
  const [busyId, setBusyId] = useState<string | null>(null);

  const playerNameMap = useMemo(() => new Map(players.map((p) => [p.id, p.full_name?.trim() ? p.full_name : p.display_name])), [players]);
  const locationNameMap = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations]);
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
        .eq("signup_open", true)
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
    setCompetitions((compRes.data ?? []) as Competition[]);
    setEntries(entryRows);
    setPlayers(playerRes.data ?? []);
    setLocations((locationRes.data ?? []) as Location[]);
  };

  useEffect(() => {
    void reload();
  }, []);

  const reviewEntry = async (entryId: string, status: "approved" | "rejected") => {
    const client = supabase;
    if (!client) return;
    if (!admin.canManageLeague || !admin.userId) {
      setMessage("League Secretary, Chairman or Treasurer access is required to review competition entries.");
      return;
    }
    setBusyId(entryId);
    const res = await client
      .from("competition_entries")
      .update({ status, reviewed_by_user_id: admin.userId, reviewed_at: new Date().toISOString() })
      .eq("id", entryId)
      .eq("status", "pending");
    if (res.error) setMessage(res.error.message);
    setBusyId(null);
    await reload();
  };

  const withdrawEntry = async (entryId: string) => {
    const client = supabase;
    if (!client) return;
    setBusyId(entryId);
    const res = await client.from("competition_entries").update({ status: "withdrawn" }).eq("id", entryId);
    if (res.error) setMessage(res.error.message);
    setBusyId(null);
    await reload();
  };

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

          <section className="space-y-3">
            {competitions.map((c) => {
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
                                    disabled={busyId === e.id}
                                    onClick={() => void reviewEntry(e.id, "approved")}
                                    className="rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyId === e.id}
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
            {!competitions.length ? (
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
