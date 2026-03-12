"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import MessageModal from "@/components/MessageModal";
import { supabase } from "@/lib/supabase";
import useAdminStatus from "@/components/useAdminStatus";

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

type Player = { id: string; display_name: string; full_name: string | null; date_of_birth?: string | null };
type AppUser = { id: string; linked_player_id: string | null };
type Location = { id: string; name: string };
type TeamEntryNote = { teamMemberNames?: string[] };

function getMinimumAgeForCompetition(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("over 60")) return 60;
  if (lower.includes("over 50")) return 50;
  return null;
}

function calculateAgeYears(dobIso: string) {
  const dob = new Date(dobIso);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

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
  const [linkedPlayerId, setLinkedPlayerId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dobByCompetitionId, setDobByCompetitionId] = useState<Record<string, string>>({});
  const [entryNamesByCompetitionId, setEntryNamesByCompetitionId] = useState<Record<string, { second: string; third: string }>>({});

  const playerNameMap = useMemo(() => new Map(players.map((p) => [p.id, p.full_name?.trim() ? p.full_name : p.display_name])), [players]);
  const locationNameMap = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations]);
  const linkedPlayer = useMemo(
    () => (linkedPlayerId ? players.find((p) => p.id === linkedPlayerId) ?? null : null),
    [players, linkedPlayerId]
  );
  const linkedPlayerDob = linkedPlayer?.date_of_birth ?? null;

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

    const [compRes, entryResWithDob, playerResWithDob, appUserRes, locationRes] = await Promise.all([
      client
        .from("competitions")
        .select("id,name,sport_type,competition_format,match_mode,location_id,signup_open,signup_deadline,max_entries,is_archived,is_completed")
        .eq("is_archived", false)
        .eq("is_completed", false)
        .eq("signup_open", true)
        .order("name"),
      client
        .from("competition_entries")
        .select("id,competition_id,requester_user_id,player_id,entrant_date_of_birth,status,created_at,reviewed_at,note")
        .order("created_at", { ascending: false }),
      client.from("players").select("id,display_name,full_name,date_of_birth"),
      client.from("app_users").select("id,linked_player_id").eq("id", uid).maybeSingle(),
      client.from("locations").select("id,name"),
    ]);
    let entryRows: Entry[] = [];
    if (entryResWithDob.error && entryResWithDob.error.message.toLowerCase().includes("entrant_date_of_birth")) {
      const entryResFallback = await client
        .from("competition_entries")
        .select("id,competition_id,requester_user_id,player_id,status,created_at,reviewed_at,note")
        .order("created_at", { ascending: false });
      if (entryResFallback.error) {
        setMessage(compRes.error?.message || entryResFallback.error?.message || playerResWithDob.error?.message || locationRes.error?.message || "Failed to load sign-ups.");
        return;
      }
      entryRows = (entryResFallback.data ?? []) as Entry[];
    } else if (entryResWithDob.error) {
      setMessage(compRes.error?.message || entryResWithDob.error?.message || playerResWithDob.error?.message || locationRes.error?.message || "Failed to load sign-ups.");
      return;
    } else {
      entryRows = (entryResWithDob.data ?? []) as Entry[];
    }

    let playerRows: Player[] = [];
    if (playerResWithDob.error && playerResWithDob.error.message.toLowerCase().includes("date_of_birth")) {
      const playerResFallback = await client.from("players").select("id,display_name,full_name");
      if (playerResFallback.error) {
        setMessage(compRes.error?.message || playerResFallback.error?.message || locationRes.error?.message || "Failed to load sign-ups.");
        return;
      }
      playerRows = (playerResFallback.data ?? []) as Player[];
    } else {
      playerRows = (playerResWithDob.data ?? []) as Player[];
    }

    if (compRes.error || locationRes.error) {
      setMessage(compRes.error?.message || locationRes.error?.message || "Failed to load sign-ups.");
      return;
    }
    setCompetitions((compRes.data ?? []) as Competition[]);
    setEntries(entryRows);
    setPlayers(playerRows);
    setLocations((locationRes.data ?? []) as Location[]);
    setLinkedPlayerId((appUserRes.data as AppUser | null)?.linked_player_id ?? null);
  };

  useEffect(() => {
    void reload();
  }, []);

  const submitEntry = async (competitionId: string) => {
    const client = supabase;
    if (!client || !userId) return;
    if (!linkedPlayerId) {
      setMessage("Complete your player profile link before entering a competition.");
      return;
    }
    const target = competitions.find((c) => c.id === competitionId);
    if (!target) {
      setMessage("Competition not found.");
      return;
    }
    if (!target.signup_open) {
      setMessage("Sign-ups are closed for this competition.");
      return;
    }
    if (target.signup_deadline && Date.parse(target.signup_deadline) < Date.now()) {
      setMessage("Sign-up deadline has passed for this competition.");
      return;
    }
    if (target.max_entries) {
      const approved = entries.filter((e) => e.competition_id === competitionId && e.status === "approved").length;
      if (approved >= target.max_entries) {
        setMessage("This competition is full.");
        return;
      }
    }
    const entrantsRequired = requiredEntrants(target);
    const extraNames = entryNamesByCompetitionId[competitionId] ?? { second: "", third: "" };
    const second = extraNames.second.trim();
    const third = extraNames.third.trim();
    if (entrantsRequired >= 2 && !second) {
      setMessage(target.match_mode === "doubles" ? "Enter your teammate name to submit this doubles entry." : "Enter player 2 name.");
      return;
    }
    if (entrantsRequired >= 3 && !third) {
      setMessage("Enter player 3 name to submit this triples entry.");
      return;
    }
    const minAge = getMinimumAgeForCompetition(target.name);
    const dob = (dobByCompetitionId[competitionId] ?? linkedPlayerDob ?? "").trim();
    if (minAge !== null) {
      if (!dob) {
        setMessage(`Date of birth is required to enter ${target.name}. Update your profile date of birth or enter it here.`);
        return;
      }
      const age = calculateAgeYears(dob);
      if (age === null) {
        setMessage("Enter a valid date of birth.");
        return;
      }
      if (age < minAge) {
        setMessage(`You are not eligible for ${target.name}. Minimum age is ${minAge}.`);
        return;
      }
    }
    setBusyId(competitionId);
    const { data: sessionRes } = await client.auth.getSession();
    const token = sessionRes.session?.access_token;
    if (!token) {
      setBusyId(null);
      setMessage("Session expired. Please sign in again.");
      return;
    }
    const teamMemberNames = entrantsRequired === 1 ? [] : entrantsRequired === 2 ? [second] : [second, third];
    const resp = await fetch("/api/competition/entry-submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        competitionId,
        entrantDateOfBirth: dob || null,
        teamMemberNames,
      }),
    });
    const data = (await resp.json().catch(() => ({}))) as { error?: string };
    if (!resp.ok) {
      setBusyId(null);
      setMessage(data.error ?? "Failed to submit competition entry.");
      return;
    }
    setBusyId(null);
    await reload();
  };

  const reviewEntry = async (entryId: string, status: "approved" | "rejected") => {
    const client = supabase;
    if (!client) return;
    if (!admin.isSuper || !admin.userId) {
      setMessage("Only Super User can approve or reject competition entries.");
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

  const now = Date.now();

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <RequireAuth>
          <ScreenHeader title="Competition Sign-ups" eyebrow="Sign-ups" subtitle="Enter open competitions and track approval status." />
          <MessageModal message={message} onClose={() => setMessage(null)} />

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">
              Entries are submitted as pending. Super User reviews and approves/rejects competition entry requests.
            </p>
          </section>

          <section className="space-y-3">
            {competitions.map((c) => {
              const userEntry = entries.find((e) => e.competition_id === c.id && e.requester_user_id === userId);
              const allEntries = entries.filter((e) => e.competition_id === c.id && e.status !== "withdrawn");
              const approvedCount = allEntries.filter((e) => e.status === "approved").length;
              const pendingCount = allEntries.filter((e) => e.status === "pending").length;
              const deadlinePassed = c.signup_deadline ? Date.parse(c.signup_deadline) < now : false;
              const full = c.max_entries ? approvedCount >= c.max_entries : false;
              const canEnter = !deadlinePassed && !full && (!userEntry || userEntry.status === "rejected" || userEntry.status === "withdrawn");
              const isAlreadyEntered = userEntry?.status === "approved";
              const minAge = getMinimumAgeForCompetition(c.name);
              const entrantsRequired = requiredEntrants(c);
              const extraNames = entryNamesByCompetitionId[c.id] ?? { second: "", third: "" };
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
                        {c.signup_deadline ? ` · Deadline: ${new Date(c.signup_deadline).toLocaleString()}` : ""}
                      </p>
                    </div>
                    <Link href={`/competitions/${c.id}`} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50">
                      View Event
                    </Link>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {entrantsRequired > 1 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          type="text"
                          value={extraNames.second}
                          onChange={(e) =>
                            setEntryNamesByCompetitionId((prev) => ({
                              ...prev,
                              [c.id]: { ...(prev[c.id] ?? { second: "", third: "" }), second: e.target.value },
                            }))
                          }
                          placeholder={entrantsRequired === 2 ? "Teammate name (required)" : "Player 2 name (required)"}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                        />
                        {entrantsRequired === 3 ? (
                          <input
                            type="text"
                            value={extraNames.third}
                            onChange={(e) =>
                              setEntryNamesByCompetitionId((prev) => ({
                                ...prev,
                                [c.id]: { ...(prev[c.id] ?? { second: "", third: "" }), third: e.target.value },
                              }))
                            }
                            placeholder="Player 3 name (required)"
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                          />
                        ) : null}
                      </div>
                    ) : null}
                    {minAge !== null ? (
                      <div className="space-y-1">
                        <input
                          type="date"
                          value={dobByCompetitionId[c.id] ?? userEntry?.entrant_date_of_birth ?? linkedPlayerDob ?? ""}
                          onChange={(e) => setDobByCompetitionId((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                          aria-label={`Date of birth for ${c.name}`}
                        />
                        <p className="text-[11px] text-slate-500">Used to validate age eligibility for this competition.</p>
                      </div>
                    ) : null}
                    {userEntry ? (
                      <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                        Your status: {userEntry.status}
                      </span>
                    ) : null}
                    {isAlreadyEntered ? (
                      <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                        Entered
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={admin.isSuper || !canEnter || busyId === c.id}
                        onClick={() => void submitEntry(c.id)}
                        className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                      >
                        {busyId === c.id ? "Submitting..." : admin.isSuper ? "Super User cannot enter" : "Enter Competition"}
                      </button>
                    )}
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
                    {minAge !== null ? <span className="text-xs text-slate-600">Eligibility: age {minAge}+</span> : null}
                    {entrantsRequired === 2 ? <span className="text-xs text-slate-600">Entry requires 2 players.</span> : null}
                    {entrantsRequired === 3 ? <span className="text-xs text-slate-600">Entry requires 3 players.</span> : null}
                  </div>

                  {(admin.isAdmin || admin.isSuper) && allEntries.length > 0 ? (
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
                              {admin.isSuper && e.status === "pending" ? (
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
