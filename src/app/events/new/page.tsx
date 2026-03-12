"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { supabase } from "@/lib/supabase";
import useAdminStatus from "@/components/useAdminStatus";
import useFeatureAccess from "@/components/useFeatureAccess";
import ScreenHeader from "@/components/ScreenHeader";
import { logAudit } from "@/lib/audit";
import ConfirmModal from "@/components/ConfirmModal";
import InfoModal from "@/components/InfoModal";
import MessageModal from "@/components/MessageModal";

type Sport = "snooker";
type Format = "knockout" | "league";
type Mode = "singles" | "doubles";
type Player = { id: string; display_name: string; full_name?: string | null };
type TeamPick = { player1: string; player2: string };
type Location = { id: string; name: string };
const BEST_OF_OPTIONS = [1, 3, 5, 7, 9, 11, 13, 15];

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export default function NewEventPage() {
  const router = useRouter();
  const admin = useAdminStatus();
  const features = useFeatureAccess();
  const competitionCreateAllowed = admin.isSuper || (admin.isAdmin && features.competitionCreateEnabled);
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [locationId, setLocationId] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [sport, setSport] = useState<Sport>("snooker");
  const [format, setFormat] = useState<Format>("knockout");
  const [mode, setMode] = useState<Mode>("singles");
  const [bestOf, setBestOf] = useState("1");
  const [bestOfSemi, setBestOfSemi] = useState("5");
  const [bestOfFinal, setBestOfFinal] = useState("7");
  const [roundBestOfEnabled, setRoundBestOfEnabled] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [teams, setTeams] = useState<TeamPick[]>([
    { player1: "", player2: "" },
    { player1: "", player2: "" },
  ]);
  const [doublesSearch, setDoublesSearch] = useState("");
  const [activeDoublesSlot, setActiveDoublesSlot] = useState<{ team: number; slot: "player1" | "player2" } | null>(null);
  const [appAssignOpeningBreak, setAppAssignOpeningBreak] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [signupDeadline, setSignupDeadline] = useState("");
  const [signupMaxEntries, setSignupMaxEntries] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [createConfirmOpen, setCreateConfirmOpen] = useState(false);
  const [infoModal, setInfoModal] = useState<{ title: string; description: string } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [adminLocationId, setAdminLocationId] = useState<string | null>(null);
  const hasDraftChanges = !!(
    name.trim() ||
    venue.trim() ||
    locationId ||
    selected.length > 0 ||
    teams.some((t) => t.player1 || t.player2) ||
    bestOf !== "1" ||
    bestOfSemi !== "5" ||
    bestOfFinal !== "7" ||
    roundBestOfEnabled ||
    format !== "knockout" ||
    mode !== "singles" ||
    appAssignOpeningBreak ||
    signupOpen ||
    signupDeadline ||
    signupMaxEntries
  );

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    const load = async () => {
      const [{ data, error }, locRes, authRes] = await Promise.all([
        client.from("players").select("id,display_name,full_name").eq("is_archived", false).order("display_name"),
        client.from("locations").select("id,name").order("name"),
        client.auth.getUser(),
      ]);
      if (!active) return;
      if (error || !data) {
        setMessage(error?.message ?? "Failed to load players.");
        return;
      }
      setPlayers(data as Player[]);
      const currentUserId = authRes.data.user?.id ?? null;
      setUserId(currentUserId);
      if (currentUserId) {
        const myPlayer = await client.from("players").select("location_id").eq("claimed_by", currentUserId).maybeSingle();
        if (!myPlayer.error) {
          setAdminLocationId(myPlayer.data?.location_id ?? null);
        }
      }
      if (!locRes.error && locRes.data) {
        const allLocations = locRes.data as Location[];
        if (admin.isSuper) {
          setLocations(allLocations);
        } else {
          const scoped = adminLocationId ? allLocations.filter((l) => l.id === adminLocationId) : allLocations;
          setLocations(scoped);
          if (adminLocationId) setLocationId(adminLocationId);
        }
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [admin.isSuper, adminLocationId]);

  const selectedCount = useMemo(() => selected.length, [selected.length]);
  const selectedTeamPlayers = useMemo(
    () => teams.flatMap((t) => [t.player1, t.player2]).filter(Boolean),
    [teams]
  );
  const isTeamPlayerTakenElsewhere = (
    candidateId: string,
    teamIndex: number,
    slot: "player1" | "player2"
  ) => {
    for (let i = 0; i < teams.length; i += 1) {
      if (i === teamIndex) {
        const otherSlot = slot === "player1" ? "player2" : "player1";
        if (teams[i][otherSlot] === candidateId) return true;
      } else if (teams[i].player1 === candidateId || teams[i].player2 === candidateId) {
        return true;
      }
    }
    return false;
  };

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const updateTeam = (idx: number, key: "player1" | "player2", value: string) => {
    setTeams((prev) => prev.map((t, i) => (i === idx ? { ...t, [key]: value } : t)));
  };

  const addTeam = () => setTeams((prev) => [...prev, { player1: "", player2: "" }]);
  const removeTeam = (idx: number) => {
    setTeams((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const createKnockoutMatches = (competitionId: string, best: number, ids: string[], appBreak: boolean) => {
    const bracketSize = nextPowerOfTwo(ids.length);
    const byeCount = bracketSize - ids.length;
    const rows: Array<{
      competition_id: string;
      round_no: number;
      match_no: number;
      best_of: number;
      status: "pending" | "bye";
      match_mode: "singles";
      player1_id: string;
      player2_id: string;
      opening_break_player_id: string | null;
      winner_player_id: string | null;
    }> = [];
    let matchNo = 1;

    // Assign BYEs directly to real players first, to avoid BYE vs BYE rows.
    for (let i = 0; i < byeCount; i += 1) {
      const playerId = ids[i];
      rows.push({
        competition_id: competitionId,
        round_no: 1,
        match_no: matchNo++,
        best_of: best,
        status: "bye",
        match_mode: "singles",
        // matches_mode_shape_ck requires both singles player columns to be non-null.
        player1_id: playerId,
        player2_id: playerId,
        opening_break_player_id: null,
        winner_player_id: playerId,
      });
    }

    const remaining = ids.slice(byeCount);
    for (let i = 0; i < remaining.length; i += 2) {
      rows.push({
        competition_id: competitionId,
        round_no: 1,
        match_no: matchNo++,
        best_of: best,
        status: "pending",
        match_mode: "singles",
        player1_id: remaining[i],
        player2_id: remaining[i + 1],
        opening_break_player_id: appBreak
          ? (Math.random() < 0.5 ? remaining[i] : remaining[i + 1])
          : null,
        winner_player_id: null,
      });
    }

    return rows;
  };

  const createLeagueMatches = (competitionId: string, best: number, ids: string[], appBreak: boolean) => {
    const rows: Array<{
      competition_id: string; round_no: number; match_no: number; best_of: number; status: "pending"; match_mode: "singles"; player1_id: string; player2_id: string; opening_break_player_id: string | null;
    }> = [];
    const arr = [...ids];
    if (arr.length % 2 === 1) arr.push("__bye__");
    const n = arr.length;
    for (let round = 0; round < n - 1; round += 1) {
      let matchNo = 1;
      for (let i = 0; i < n / 2; i += 1) {
        const a = arr[i];
        const b = arr[n - 1 - i];
        if (a !== "__bye__" && b !== "__bye__") {
          rows.push({
            competition_id: competitionId,
            round_no: round + 1,
            match_no: matchNo++,
            best_of: best,
            status: "pending",
            match_mode: "singles",
            player1_id: a,
            player2_id: b,
            opening_break_player_id: appBreak ? (Math.random() < 0.5 ? a : b) : null,
          });
        }
      }
      const fixed = arr[0];
      const rest = arr.slice(1);
      const last = rest.pop()!;
      arr.splice(0, arr.length, fixed, last, ...rest);
    }
    return rows;
  };

  const createKnockoutDoubles = (competitionId: string, best: number, picks: TeamPick[], appBreak: boolean) => {
    const rows: Array<{
      competition_id: string;
      round_no: number;
      match_no: number;
      best_of: number;
      status: "pending";
      match_mode: "doubles";
      team1_player1_id: string;
      team1_player2_id: string;
      team2_player1_id: string;
      team2_player2_id: string;
      opening_break_player_id: string | null;
      winner_player_id: string | null;
    }> = [];
    for (let i = 0; i < picks.length; i += 2) {
      const a = picks[i];
      const b = picks[i + 1];
      const breakChoices = [a.player1, a.player2, b.player1, b.player2];
      rows.push({
        competition_id: competitionId,
        round_no: 1,
        match_no: (i / 2) + 1,
        best_of: best,
        status: "pending",
        match_mode: "doubles",
        team1_player1_id: a.player1,
        team1_player2_id: a.player2,
        team2_player1_id: b.player1,
        team2_player2_id: b.player2,
        opening_break_player_id: appBreak ? breakChoices[Math.floor(Math.random() * breakChoices.length)] : null,
        winner_player_id: null,
      });
    }
    return rows;
  };

  const createLeagueDoubles = (competitionId: string, best: number, picks: TeamPick[], appBreak: boolean) => {
    const rows: Array<{
      competition_id: string;
      round_no: number;
      match_no: number;
      best_of: number;
      status: "pending";
      match_mode: "doubles";
      team1_player1_id: string;
      team1_player2_id: string;
      team2_player1_id: string;
      team2_player2_id: string;
      opening_break_player_id: string | null;
    }> = [];
    const arr: Array<TeamPick | null> = [...picks];
    if (arr.length % 2 === 1) arr.push(null);
    const n = arr.length;
    for (let round = 0; round < n - 1; round += 1) {
      let matchNo = 1;
      for (let i = 0; i < n / 2; i += 1) {
        const a = arr[i];
        const b = arr[n - 1 - i];
        if (a && b) {
          const breakChoices = [a.player1, a.player2, b.player1, b.player2];
          rows.push({
            competition_id: competitionId,
            round_no: round + 1,
            match_no: matchNo++,
            best_of: best,
            status: "pending",
            match_mode: "doubles",
            team1_player1_id: a.player1,
            team1_player2_id: a.player2,
            team2_player1_id: b.player1,
            team2_player2_id: b.player2,
            opening_break_player_id: appBreak ? breakChoices[Math.floor(Math.random() * breakChoices.length)] : null,
          });
        }
      }
      const fixed = arr[0];
      const rest = arr.slice(1);
      const last = rest.pop()!;
      arr.splice(0, arr.length, fixed, last, ...rest);
    }
    return rows;
  };

  const onCreate = async () => {
    setMessage(null);
    const client = supabase;
    if (!client) {
      setMessage("Supabase is not configured.");
      return;
    }
    if (!competitionCreateAllowed) {
      setMessage("Create Competition is disabled for your account. Ask the Super User to enable it.");
      return;
    }
    if (!locationId) {
      setMessage("Select a location before creating a competition.");
      return;
    }
    if (!admin.isSuper && !adminLocationId) {
      setMessage("Your admin profile must be linked to a location before creating competitions.");
      return;
    }
    if (!admin.isSuper && adminLocationId && locationId !== adminLocationId) {
      setMessage("Administrators can only create competitions at their own location.");
      return;
    }
    const best = Number(bestOf);
    const semi = Number(bestOfSemi);
    const final = Number(bestOfFinal);
    if (!name.trim()) {
      setMessage("Competition name is required.");
      return;
    }
    if (!Number.isInteger(best) || best < 1) {
      setMessage("Best Of must be a positive whole number.");
      return;
    }
    if (roundBestOfEnabled) {
      if (!Number.isInteger(semi) || semi < best) {
        setMessage("Semi-final Best Of must be a whole number and not less than opening round.");
        return;
      }
      if (!Number.isInteger(final) || final < semi) {
        setMessage("Final Best Of must be a whole number and not less than semi-final.");
        return;
      }
    }
    const validTeams = teams.filter((t) => t.player1 && t.player2);
    const uniqueTeamPlayerCount = new Set(selectedTeamPlayers).size;

    if (!signupOpen && mode === "singles" && selected.length < 2) {
      setMessage("Select at least 2 players.");
      return;
    }
    if (mode === "doubles" && !signupOpen) {
      if (validTeams.length < 2) {
        setMessage("Create at least 2 doubles teams.");
        return;
      }
      if (selectedTeamPlayers.length !== uniqueTeamPlayerCount) {
        setMessage("Each doubles player can only be selected once.");
        return;
      }
      if (format === "knockout" && (validTeams.length & (validTeams.length - 1)) !== 0) {
        setMessage("Doubles knockout currently requires 2, 4, 8... teams (power of two).");
        return;
      }
    }
    if (!signupOpen && mode === "singles" && format === "knockout" && selected.length < 2) {
      setMessage("Knockout requires at least 2 players.");
      return;
    }
    if (signupMaxEntries && Number.parseInt(signupMaxEntries, 10) <= 0) {
      setMessage("Max sign-up entries must be greater than zero.");
      return;
    }
    const knockoutRoundBestOf = format === "knockout" && roundBestOfEnabled
      ? {
          round1: best,
          semi_final: semi,
          final,
        }
      : {};

    setSaving(true);
    const compRes = await client
      .from("competitions")
      .insert({
        name: name.trim(),
        venue: venue.trim() || null,
        location_id: locationId,
        sport_type: sport,
        competition_format: format,
        best_of: best,
        match_mode: mode,
        is_practice: false,
        include_in_stats: true,
        app_assign_opening_break: appAssignOpeningBreak,
        knockout_round_best_of: knockoutRoundBestOf,
        signup_open: signupOpen,
        signup_deadline: signupDeadline ? new Date(signupDeadline).toISOString() : null,
        max_entries: signupMaxEntries ? Number.parseInt(signupMaxEntries, 10) : null,
        is_archived: false,
        is_completed: false,
      })
      .select("id")
      .single();

    if (compRes.error || !compRes.data) {
      setSaving(false);
      setMessage(compRes.error?.message ?? "Failed to create competition.");
      return;
    }
    const competitionId = compRes.data.id as string;
    const singlesReady = mode === "singles" && selected.length >= 2;
    const doublesReady = mode === "doubles" && validTeams.length >= 2;
    const matches = mode === "singles"
      ? (singlesReady
          ? (
              format === "knockout"
                ? createKnockoutMatches(competitionId, best, selected, appAssignOpeningBreak)
                : createLeagueMatches(competitionId, best, selected, appAssignOpeningBreak)
            )
          : [])
      : (doublesReady
          ? (
              format === "knockout"
                ? createKnockoutDoubles(competitionId, best, validTeams, appAssignOpeningBreak)
                : createLeagueDoubles(competitionId, best, validTeams, appAssignOpeningBreak)
            )
          : []);

    if (matches.length > 0) {
      const mRes = await client.from("matches").insert(matches);
      if (mRes.error) {
        await client.from("competitions").delete().eq("id", competitionId);
        setSaving(false);
        setMessage(mRes.error.message);
        return;
      }
    }

    await logAudit("competition_created", {
      entityType: "competition",
      entityId: competitionId,
      summary: `${name.trim()} created (${format}, ${mode}, best of ${best}).`,
      meta: {
        sport,
        format,
        mode,
        bestOf: best,
        roundSpecificBestOf: roundBestOfEnabled ? { semi: semi, final: final } : null,
        locationId,
        entrants: mode === "singles" ? selected.length : validTeams.length,
      },
    });

    setSaving(false);
    router.push("/events?tab=open");
  };

  const onCreateClick = () => {
    setCreateConfirmOpen(true);
  };

  const cardClass = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
  const fieldClass = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900";
  const mutedCardClass = "rounded-xl border border-slate-200 bg-slate-50 p-3";
  const pillBaseClass = "rounded-full px-3 py-1.5 text-sm font-medium transition";
  const pillActiveClass = `${pillBaseClass} border border-teal-700 bg-teal-700 text-white`;
  const pillIdleClass = `${pillBaseClass} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
  const primaryButtonClass = "rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60";

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <RequireAuth>
          <ScreenHeader
            title="Create Competition"
            eyebrow="Competition"
            subtitle="Set up knockout or league events."
            warnOnNavigate={hasDraftChanges}
            warnMessage="You have unsaved competition setup. Leave this screen and lose your changes?"
          />

          {!admin.loading && !admin.isAdmin ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              Competition setup is available to the club administrator only.
            </section>
          ) : null}

          {!admin.loading && admin.isAdmin && !features.loading && !competitionCreateAllowed ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              Create Competition is disabled for your account. Ask the Super User to enable this feature.
            </section>
          ) : null}

          {!admin.loading && !admin.isAdmin ? null : !competitionCreateAllowed ? null : (
          <section className={`${cardClass} space-y-4`}>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Competition name</label>
              <input className={fieldClass} placeholder="Competition name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <select
              className={fieldClass}
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value);
                const selected = locations.find((loc) => loc.id === e.target.value);
                setVenue(selected?.name ?? "");
              }}
            >
              <option value="">Select location (required)</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Sport</label>
                <select className={fieldClass} value={sport} onChange={(e) => setSport(e.target.value as Sport)}>
                  <option value="snooker">Snooker</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Mode</label>
                <div className="flex gap-2">
                  <button type="button" className={mode === "singles" ? pillActiveClass : pillIdleClass} onClick={() => setMode("singles")}>
                    Singles
                  </button>
                  <button
                    type="button"
                    className={mode === "doubles" ? pillActiveClass : pillIdleClass}
                    onClick={() => setMode("doubles")}
                  >
                    Doubles
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Format</label>
                <div className="flex gap-2">
                  <button type="button" className={format === "knockout" ? pillActiveClass : pillIdleClass} onClick={() => setFormat("knockout")}>
                    Knockout
                  </button>
                  <button
                    type="button"
                    className={format === "league" ? pillActiveClass : pillIdleClass}
                    onClick={() => setFormat("league")}
                  >
                    League
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Race length</label>
                <select className={fieldClass} value={bestOf} onChange={(e) => setBestOf(e.target.value)}>
                  {BEST_OF_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      Best of {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {format === "knockout" ? (
              <div className={mutedCardClass}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-700">Round-specific Best Of</p>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <span>Enable</span>
                    <input
                      type="checkbox"
                      checked={roundBestOfEnabled}
                      onChange={(e) => setRoundBestOfEnabled(e.target.checked)}
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Opening round</label>
                    <select
                      disabled={!roundBestOfEnabled}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 disabled:opacity-60"
                      value={bestOf}
                      onChange={(e) => setBestOf(e.target.value)}
                    >
                      {BEST_OF_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          Best of {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Semi-final</label>
                    <select
                      disabled={!roundBestOfEnabled}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 disabled:opacity-60"
                      value={bestOfSemi}
                      onChange={(e) => setBestOfSemi(e.target.value)}
                    >
                      {BEST_OF_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          Best of {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Final</label>
                    <select
                      disabled={!roundBestOfEnabled}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 disabled:opacity-60"
                      value={bestOfFinal}
                      onChange={(e) => setBestOfFinal(e.target.value)}
                    >
                      {BEST_OF_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          Best of {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ) : null}
            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="text-sm font-medium text-slate-700">
                Auto-Select Opening Breaker
              </span>
              <input
                type="checkbox"
                checked={appAssignOpeningBreak}
                onChange={(e) => setAppAssignOpeningBreak(e.target.checked)}
              />
            </label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-700">Open competition sign-ups</span>
                <input type="checkbox" checked={signupOpen} onChange={(e) => setSignupOpen(e.target.checked)} />
              </div>
              {signupOpen ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Sign-up deadline (optional)</label>
                    <input
                      type="datetime-local"
                      className={fieldClass}
                      value={signupDeadline}
                      onChange={(e) => setSignupDeadline(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Max entries (optional)</label>
                    <input
                      type="number"
                      min={1}
                      className={fieldClass}
                      value={signupMaxEntries}
                      onChange={(e) => setSignupMaxEntries(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}
            </div>
            {mode === "singles" ? (
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Players ({selectedCount} selected)</p>
                <div className={`${mutedCardClass} space-y-2`}>
                  <input
                    className={fieldClass}
                    placeholder="Search players..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    {selected.length === 0 ? (
                      <span className="text-xs text-slate-500">No players selected.</span>
                    ) : (
                      selected.map((id) => {
                        const p = players.find((x) => x.id === id);
                        const label = p?.full_name?.trim() ? p.full_name : p?.display_name ?? "Player";
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => toggle(id)}
                            className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs text-slate-700"
                          >
                            {label} ✕
                          </button>
                        );
                      })
                    )}
                  </div>
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
                    {players
                      .filter((p) => {
                        const label = (p.full_name?.trim() ? p.full_name : p.display_name).toLowerCase();
                        return label.includes(search.trim().toLowerCase());
                      })
                      .map((p) => {
                        const label = p.full_name?.trim() ? p.full_name : p.display_name;
                        const selectedRow = selected.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => toggle(p.id)}
                            className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm ${selectedRow ? "bg-slate-50 text-slate-700" : "text-slate-700 hover:bg-slate-50"}`}
                          >
                            <span>{label}</span>
                            {selectedRow ? <span className="text-xs text-emerald-700">Selected</span> : null}
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
            ) : (
              <div className={`${mutedCardClass} space-y-3`}>
                <p className="text-sm font-medium text-slate-700">Doubles teams ({teams.length})</p>
                {teams.map((t, idx) => (
                  <div key={`team-${idx}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    {(["player1", "player2"] as const).map((slot) => {
                      const value = t[slot];
                      const label = value
                        ? players.find((p) => p.id === value)?.full_name?.trim() ||
                          players.find((p) => p.id === value)?.display_name ||
                          "Player"
                        : `Team ${idx + 1} · ${slot === "player1" ? "Player 1" : "Player 2"}`;
                      return (
                        <button
                          key={`${idx}-${slot}`}
                          type="button"
                          onClick={() => setActiveDoublesSlot({ team: idx, slot })}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                            activeDoublesSlot?.team === idx && activeDoublesSlot.slot === slot
                              ? "border-teal-600 bg-teal-50 text-teal-900"
                              : "border-slate-300 bg-white text-slate-700"
                          }`}
                        >
                          <span>{label}</span>
                          {value ? (
                            <span
                              className="text-xs text-slate-500"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateTeam(idx, slot, "");
                              }}
                            >
                              ✕
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => removeTeam(idx)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
                      disabled={teams.length <= 2}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                  <input
                    className={fieldClass}
                    placeholder="Search players..."
                    value={doublesSearch}
                    onChange={(e) => setDoublesSearch(e.target.value)}
                  />
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                    {players
                      .filter((p) => {
                        const label = (p.full_name?.trim() ? p.full_name : p.display_name).toLowerCase();
                        return label.includes(doublesSearch.trim().toLowerCase());
                      })
                      .map((p) => {
                        const label = p.full_name?.trim() ? p.full_name : p.display_name;
                        const disabled = !activeDoublesSlot || isTeamPlayerTakenElsewhere(p.id, activeDoublesSlot.team, activeDoublesSlot.slot);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => activeDoublesSlot && updateTeam(activeDoublesSlot.team, activeDoublesSlot.slot, p.id)}
                            className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm ${
                              disabled ? "text-slate-400" : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <span>{label}</span>
                            {isTeamPlayerTakenElsewhere(p.id, activeDoublesSlot?.team ?? 0, activeDoublesSlot?.slot ?? "player1") ? (
                              <span className="text-xs text-emerald-700">Selected</span>
                            ) : null}
                          </button>
                        );
                      })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={addTeam}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  Add team
                </button>
              </div>
            )}
            <button type="button" onClick={onCreateClick} disabled={saving} className={primaryButtonClass}>
              {saving ? "Creating..." : "Create competition"}
            </button>
            <MessageModal message={message} onClose={() => setMessage(null)} />
          </section>
          )}
        </RequireAuth>
        <ConfirmModal
          open={createConfirmOpen}
          title="Create Competition"
          description="Are you sure you want to create this competition?"
          confirmLabel="Create Competition"
          cancelLabel="Cancel"
          onCancel={() => {
            setCreateConfirmOpen(false);
            setInfoModal({ title: "Not Saved", description: "Details will not be saved." });
            router.push("/");
          }}
          onConfirm={async () => {
            setCreateConfirmOpen(false);
            await onCreate();
          }}
        />
        <InfoModal
          open={Boolean(infoModal)}
          title={infoModal?.title ?? ""}
          description={infoModal?.description ?? ""}
          onClose={() => setInfoModal(null)}
        />
      </div>
    </main>
  );
}
