"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import MessageModal from "@/components/MessageModal";
import InfoModal from "@/components/InfoModal";
import { supabase } from "@/lib/supabase";
import useAdminStatus from "@/components/useAdminStatus";

type MatchRow = {
  id: string;
  competition_id: string | null;
  status: "pending" | "in_progress" | "complete" | "bye";
  best_of: number;
  player1_id: string | null;
  player2_id: string | null;
  team1_player1_id: string | null;
  team1_player2_id: string | null;
  team2_player1_id: string | null;
  team2_player2_id: string | null;
  winner_player_id: string | null;
  round_no: number | null;
  match_no: number | null;
};

type CompetitionRow = {
  id: string;
  name: string;
  sport_type: string;
};

type PlayerRow = { id: string; display_name: string; full_name: string | null };

type SubmissionRow = {
  id: string;
  status: "pending" | "approved" | "rejected" | "needs_correction";
  created_at: string;
  rejection_reason: string | null;
};

const isAlberyCompetitionName = (name: string) =>
  name === "Albery Cup (Billiards 3-Man Team)" || name.startsWith("Albery Cup (Billiards 3-Man Team) - ");

const named = (p?: PlayerRow | null) => (p ? (p.full_name?.trim() ? p.full_name : p.display_name) : "TBC");

export default function MatchPage() {
  const params = useParams();
  const matchId = String(params.id ?? "");
  const admin = useAdminStatus();

  const [match, setMatch] = useState<MatchRow | null>(null);
  const [competition, setCompetition] = useState<CompetitionRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [linkedPlayerId, setLinkedPlayerId] = useState<string | null>(null);
  const [latestSubmission, setLatestSubmission] = useState<SubmissionRow | null>(null);

  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState<{ title: string; description: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [winnerSide, setWinnerSide] = useState<"home" | "away">("home");
  const [homeScore, setHomeScore] = useState("0");
  const [awayScore, setAwayScore] = useState("0");
  const [frameScores, setFrameScores] = useState<Array<{ home: string; away: string }>>([]);

  const [alberyHomeP1, setAlberyHomeP1] = useState("");
  const [alberyHomeP2, setAlberyHomeP2] = useState("");
  const [alberyHomeP3, setAlberyHomeP3] = useState("");
  const [alberyAwayP1, setAlberyAwayP1] = useState("");
  const [alberyAwayP2, setAlberyAwayP2] = useState("");
  const [alberyAwayP3, setAlberyAwayP3] = useState("");
  const [leg1Home, setLeg1Home] = useState("0");
  const [leg1Away, setLeg1Away] = useState("0");
  const [leg2Home, setLeg2Home] = useState("0");
  const [leg2Away, setLeg2Away] = useState("0");
  const [leg3Home, setLeg3Home] = useState("0");
  const [leg3Away, setLeg3Away] = useState("0");
  const [breakEntries, setBreakEntries] = useState<Array<{ playerKey: string; value: string }>>([
    { playerKey: "", value: "" },
    { playerKey: "", value: "" },
  ]);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setMessage("Supabase is not configured.");
      return;
    }
    let active = true;
    const load = async () => {
      const [mRes, pRes] = await Promise.all([
        client
          .from("matches")
          .select(
            "id,competition_id,status,best_of,player1_id,player2_id,team1_player1_id,team1_player2_id,team2_player1_id,team2_player2_id,winner_player_id,round_no,match_no"
          )
          .eq("id", matchId)
          .maybeSingle(),
        client.from("players").select("id,display_name,full_name"),
      ]);
      if (!active) return;
      if (mRes.error || !mRes.data) {
        setMessage(mRes.error?.message ?? "Failed to load match.");
        return;
      }
      setMatch(mRes.data as MatchRow);
      const bo = Math.max(1, Number((mRes.data as MatchRow).best_of || 1));
      setFrameScores(Array.from({ length: bo }, () => ({ home: "", away: "" })));
      setPlayers((pRes.data ?? []) as PlayerRow[]);

      if (mRes.data.competition_id) {
        const cRes = await client.from("competitions").select("id,name,sport_type").eq("id", mRes.data.competition_id).maybeSingle();
        if (!active) return;
        if (cRes.data) setCompetition(cRes.data as CompetitionRow);
      }

      if (admin.userId) {
        const appRes = await client.from("app_users").select("linked_player_id").eq("id", admin.userId).maybeSingle();
        if (!active) return;
        setLinkedPlayerId((appRes.data?.linked_player_id as string | null) ?? null);
      }

      const sRes = await client
        .from("competition_result_submissions")
        .select("id,status,created_at,rejection_reason")
        .eq("match_id", matchId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!active) return;
      if (!sRes.error) setLatestSubmission(((sRes.data ?? [])[0] as SubmissionRow | undefined) ?? null);
    };
    void load();
    return () => {
      active = false;
    };
  }, [matchId, admin.userId]);

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const isAlbery = Boolean(competition && isAlberyCompetitionName(competition.name));
  const isHamilton = Boolean(
    competition &&
      (competition.name === "Hamilton Cup (Singles Billiards)" ||
        competition.name.startsWith("Hamilton Cup (Singles Billiards) - ") ||
        competition.name === "Hamilton Cup (Billiards Singles)" ||
        competition.name.startsWith("Hamilton Cup (Billiards Singles) - "))
  );
  const isLocked = match?.status === "complete";
  const participants = useMemo(
    () =>
      new Set(
        [
          match?.player1_id,
          match?.player2_id,
          match?.team1_player1_id,
          match?.team1_player2_id,
          match?.team2_player1_id,
          match?.team2_player2_id,
        ].filter(Boolean) as string[]
      ),
    [match]
  );
  const canSubmit = Boolean(admin.isSuper || (linkedPlayerId && participants.has(linkedPlayerId)));
  const homeLabel =
    match?.team1_player1_id || match?.team1_player2_id
      ? `${named(playerById.get(match?.team1_player1_id ?? ""))} & ${named(playerById.get(match?.team1_player2_id ?? ""))}`
      : named(playerById.get(match?.player1_id ?? ""));
  const awayLabel =
    match?.team2_player1_id || match?.team2_player2_id
      ? `${named(playerById.get(match?.team2_player1_id ?? ""))} & ${named(playerById.get(match?.team2_player2_id ?? ""))}`
      : named(playerById.get(match?.player2_id ?? ""));
  const breakPlayerOptions = useMemo(() => {
    const opts: Array<{ key: string; label: string; playerId: string | null; enteredName: string | null }> = [];
    const pushPlayer = (id: string | null | undefined) => {
      if (!id) return;
      const label = named(playerById.get(id));
      if (!opts.some((o) => o.key === `id:${id}`)) opts.push({ key: `id:${id}`, label, playerId: id, enteredName: null });
    };
    pushPlayer(match?.player1_id);
    pushPlayer(match?.player2_id);
    pushPlayer(match?.team1_player1_id);
    pushPlayer(match?.team1_player2_id);
    pushPlayer(match?.team2_player1_id);
    pushPlayer(match?.team2_player2_id);
    const pushName = (name: string) => {
      const n = name.trim();
      if (!n) return;
      if (!opts.some((o) => o.key === `name:${n.toLowerCase()}`)) {
        opts.push({ key: `name:${n.toLowerCase()}`, label: n, playerId: null, enteredName: n });
      }
    };
    [alberyHomeP1, alberyHomeP2, alberyHomeP3, alberyAwayP1, alberyAwayP2, alberyAwayP3].forEach(pushName);
    return opts;
  }, [
    match?.player1_id,
    match?.player2_id,
    match?.team1_player1_id,
    match?.team1_player2_id,
    match?.team2_player1_id,
    match?.team2_player2_id,
    playerById,
    alberyHomeP1,
    alberyHomeP2,
    alberyHomeP3,
    alberyAwayP1,
    alberyAwayP2,
    alberyAwayP3,
  ]);

  const mappedBreakEntries = breakEntries
    .map((b) => {
      const v = Number(b.value);
      if (!b.playerKey || !Number.isFinite(v) || String(b.value).trim() === "") return null;
      const hit = breakPlayerOptions.find((o) => o.key === b.playerKey);
      if (!hit) return null;
      return { player_id: hit.playerId, entered_player_name: hit.enteredName, break_value: v };
    })
    .filter(Boolean) as Array<{ player_id: string | null; entered_player_name: string | null; break_value: number }>;

  const submitStandard = async (e: FormEvent) => {
    e.preventDefault();
    if (!match) return;
    if (!canSubmit) {
      setMessage("Only match participants can submit this result.");
      return;
    }
    if (isHamilton) {
      const h = Number(homeScore);
      const a = Number(awayScore);
      if (!Number.isFinite(h) || !Number.isFinite(a) || h < 0 || a < 0) return setMessage("Enter valid scores.");
      if (h === a) return setMessage("Scores cannot be tied.");
    } else {
      const played = frameScores
        .map((fr, i) => ({ i, h: Number(fr.home), a: Number(fr.away) }))
        .filter((r) => Number.isFinite(r.h) && Number.isFinite(r.a) && (String(frameScores[r.i].home).trim() !== "" || String(frameScores[r.i].away).trim() !== ""));
      if (played.length === 0) return setMessage("Enter frame-by-frame scores.");
      let homeWins = 0;
      let awayWins = 0;
      for (const p of played) {
        if (p.h < 0 || p.a < 0) return setMessage("Frame scores cannot be negative.");
        if (p.h === p.a) return setMessage("Frame scores cannot be tied.");
        if (p.h > p.a) homeWins += 1;
        else awayWins += 1;
      }
      const winsNeeded = Math.floor(Math.max(1, match.best_of) / 2) + 1;
      const winnerWins = Math.max(homeWins, awayWins);
      const loserWins = Math.min(homeWins, awayWins);
      if (winnerWins !== winsNeeded || loserWins >= winsNeeded) {
        return setMessage(`Frame results must finish ${winsNeeded}-x or x-${winsNeeded}.`);
      }
    }

    await submitPayload({
      matchId,
      mode: "standard",
      winnerSide,
      homeScore: Number(homeScore),
      awayScore: Number(awayScore),
      frameResults: !isHamilton
        ? frameScores
            .map((fr, idx) => ({
              frameNo: idx + 1,
              home: Number(fr.home),
              away: Number(fr.away),
            }))
            .filter((fr, idx) => Number.isFinite(fr.home) && Number.isFinite(fr.away) && (String(frameScores[idx].home).trim() !== "" || String(frameScores[idx].away).trim() !== ""))
        : undefined,
      breakEntries: mappedBreakEntries,
    });
  };

  const submitAlbery = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      setMessage("Only match participants can submit this result.");
      return;
    }
    const vals = [leg1Home, leg1Away, leg2Home, leg2Away, leg3Home, leg3Away].map((v) => Number(v));
    if (vals.some((v) => !Number.isFinite(v) || v < 0)) return setMessage("Enter valid Albery scores.");
    const l1h = Number(leg1Home);
    const l1a = Number(leg1Away);
    const l2h = Number(leg2Home);
    const l2a = Number(leg2Away);
    const l3h = Number(leg3Home);
    const l3a = Number(leg3Away);
    if (l1h === l1a || l2h === l2a || l3h === l3a) return setMessage("Albery legs cannot be tied.");
    if (Math.max(l1h, l1a) < 100 || Math.max(l2h, l2a) < 200 || Math.max(l3h, l3a) < 300) {
      return setMessage("Leg thresholds must reach 100, 200 and 300.");
    }
    const inferredWinner: "home" | "away" = l3h > l3a ? "home" : "away";
    if (inferredWinner !== winnerSide) return setMessage("Winner side must match the final 300-point leg.");
    const names = [alberyHomeP1, alberyHomeP2, alberyHomeP3, alberyAwayP1, alberyAwayP2, alberyAwayP3].map((v) => v.trim());
    if (names.some((n) => !n)) return setMessage("Enter all six player names.");

    await submitPayload({
      matchId,
      mode: "albery",
      winnerSide,
      breakEntries: mappedBreakEntries,
      albery: {
        homePlayers: [alberyHomeP1.trim(), alberyHomeP2.trim(), alberyHomeP3.trim()],
        awayPlayers: [alberyAwayP1.trim(), alberyAwayP2.trim(), alberyAwayP3.trim()],
        leg1: { home: l1h, away: l1a },
        leg2: { home: l2h, away: l2a },
        leg3: { home: l3h, away: l3a },
      },
    });
  };

  const submitPayload = async (payload: Record<string, unknown>) => {
    const client = supabase;
    if (!client) return;
    const { data: sessionRes } = await client.auth.getSession();
    const token = sessionRes.session?.access_token;
    if (!token) return setMessage("Session expired. Please sign in again.");
    setSaving(true);
    try {
      const res = await fetch("/api/competition/submit-result", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaving(false);
        return setMessage(data?.error ?? "Failed to submit result.");
      }
      setSaving(false);
      setInfo({
        title: "Result Submitted",
        description: "Your result has been sent to Super User for approval.",
      });
      setLatestSubmission({ id: "latest", status: "pending", created_at: new Date().toISOString(), rejection_reason: null });
    } catch {
      setSaving(false);
      setMessage("Network error while submitting result.");
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <RequireAuth>
          <ScreenHeader title="Match Result Entry" eyebrow="Competition Match" subtitle="Submit result for Super User approval." />
          <MessageModal message={message} onClose={() => setMessage(null)} />
          <InfoModal open={Boolean(info)} title={info?.title ?? ""} description={info?.description ?? ""} onClose={() => setInfo(null)} />
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-lg font-semibold text-slate-900">{competition?.name ?? "Competition"}</p>
            <p className="text-sm text-slate-600">
              Round {match?.round_no ?? 1} · Match {match?.match_no ?? 1}
            </p>
            <p className="mt-2 text-sm text-slate-700">{homeLabel} vs {awayLabel}</p>
            {isLocked ? <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">This match is complete and locked.</p> : null}
            {latestSubmission?.status === "pending" ? (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Result submission pending review. Editing is locked until reviewed.
              </p>
            ) : null}
            {latestSubmission?.status === "rejected" ? (
              <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                Last submission was rejected{latestSubmission.rejection_reason ? `: ${latestSubmission.rejection_reason}` : "."}
              </p>
            ) : null}
            <div className="mt-3">
              <Link href={`/competitions/${match?.competition_id ?? ""}`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                Back to competition
              </Link>
            </div>
          </section>

          {!isLocked && latestSubmission?.status !== "pending" ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {!canSubmit ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  You are not a participant in this match, so you cannot submit this result.
                </p>
              ) : isAlbery ? (
                <form className="space-y-3" onSubmit={submitAlbery}>
                  <p className="text-sm font-semibold text-slate-900">Albery Cup result (3-man team, race to 300)</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input value={alberyHomeP1} onChange={(e) => setAlberyHomeP1(e.target.value)} placeholder="Home player 1 (to 100)" className="rounded-xl border border-slate-300 px-3 py-2" />
                    <input value={alberyAwayP1} onChange={(e) => setAlberyAwayP1(e.target.value)} placeholder="Away player 1 (to 100)" className="rounded-xl border border-slate-300 px-3 py-2" />
                    <input value={alberyHomeP2} onChange={(e) => setAlberyHomeP2(e.target.value)} placeholder="Home player 2 (to 200)" className="rounded-xl border border-slate-300 px-3 py-2" />
                    <input value={alberyAwayP2} onChange={(e) => setAlberyAwayP2(e.target.value)} placeholder="Away player 2 (to 200)" className="rounded-xl border border-slate-300 px-3 py-2" />
                    <input value={alberyHomeP3} onChange={(e) => setAlberyHomeP3(e.target.value)} placeholder="Home player 3 (to 300)" className="rounded-xl border border-slate-300 px-3 py-2" />
                    <input value={alberyAwayP3} onChange={(e) => setAlberyAwayP3(e.target.value)} placeholder="Away player 3 (to 300)" className="rounded-xl border border-slate-300 px-3 py-2" />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input value={leg1Home} onChange={(e) => setLeg1Home(e.target.value)} placeholder="Leg 1 home score (100)" className="rounded-xl border border-slate-300 px-3 py-2" />
                    <input value={leg2Home} onChange={(e) => setLeg2Home(e.target.value)} placeholder="Leg 2 home score (200)" className="rounded-xl border border-slate-300 px-3 py-2" />
                    <input value={leg3Home} onChange={(e) => setLeg3Home(e.target.value)} placeholder="Leg 3 home score (300)" className="rounded-xl border border-slate-300 px-3 py-2" />
                    <input value={leg1Away} onChange={(e) => setLeg1Away(e.target.value)} placeholder="Leg 1 away score (100)" className="rounded-xl border border-slate-300 px-3 py-2" />
                    <input value={leg2Away} onChange={(e) => setLeg2Away(e.target.value)} placeholder="Leg 2 away score (200)" className="rounded-xl border border-slate-300 px-3 py-2" />
                    <input value={leg3Away} onChange={(e) => setLeg3Away(e.target.value)} placeholder="Leg 3 away score (300)" className="rounded-xl border border-slate-300 px-3 py-2" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-sm text-slate-700">Winner</label>
                    <select value={winnerSide} onChange={(e) => setWinnerSide(e.target.value as "home" | "away")} className="rounded-xl border border-slate-300 px-3 py-2">
                      <option value="home">Home team</option>
                      <option value="away">Away team</option>
                    </select>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">High breaks (30+)</p>
                    <div className="mt-2 space-y-2">
                      {breakEntries.map((row, idx) => (
                        <div key={`break-${idx}`} className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                          <select
                            value={row.playerKey}
                            onChange={(e) =>
                              setBreakEntries((prev) => prev.map((r, i) => (i === idx ? { ...r, playerKey: e.target.value } : r)))
                            }
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">Select player</option>
                            {breakPlayerOptions.map((o) => (
                              <option key={o.key} value={o.key}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <input
                            value={row.value}
                            onChange={(e) =>
                              setBreakEntries((prev) => prev.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r)))
                            }
                            placeholder="Break value"
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                          />
                          <button
                            type="button"
                            onClick={() => setBreakEntries((prev) => prev.filter((_, i) => i !== idx))}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setBreakEntries((prev) => [...prev, { playerKey: "", value: "" }])}
                      className="mt-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700"
                    >
                      + Add break
                    </button>
                  </div>
                  <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                    {saving ? "Submitting..." : "Submit for approval"}
                  </button>
                </form>
              ) : (
                <form className="space-y-3" onSubmit={submitStandard}>
                  <p className="text-sm font-semibold text-slate-900">
                    {isHamilton ? "Final points submission" : `Frame-by-frame submission (best of ${match?.best_of ?? 1})`}
                  </p>
                  {isHamilton ? (
                    <>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input value={homeScore} onChange={(e) => setHomeScore(e.target.value)} placeholder="Home points" className="rounded-xl border border-slate-300 px-3 py-2" />
                        <input value={awayScore} onChange={(e) => setAwayScore(e.target.value)} placeholder="Away points" className="rounded-xl border border-slate-300 px-3 py-2" />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-sm text-slate-700">Winner</label>
                        <select value={winnerSide} onChange={(e) => setWinnerSide(e.target.value as "home" | "away")} className="rounded-xl border border-slate-300 px-3 py-2">
                          <option value="home">Home</option>
                          <option value="away">Away</option>
                        </select>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2">
                      {frameScores.map((fr, idx) => (
                        <div key={`fr-${idx}`} className="grid gap-2 sm:grid-cols-[120px_1fr_1fr_120px] sm:items-center">
                          <span className="text-xs font-semibold text-slate-600">Frame {idx + 1}</span>
                          <input
                            value={fr.home}
                            onChange={(e) =>
                              setFrameScores((prev) => prev.map((r, i) => (i === idx ? { ...r, home: e.target.value } : r)))
                            }
                            placeholder={`${homeLabel} score`}
                            className="rounded-xl border border-slate-300 px-3 py-2"
                          />
                          <input
                            value={fr.away}
                            onChange={(e) =>
                              setFrameScores((prev) => prev.map((r, i) => (i === idx ? { ...r, away: e.target.value } : r)))
                            }
                            placeholder={`${awayLabel} score`}
                            className="rounded-xl border border-slate-300 px-3 py-2"
                          />
                          <span className="text-xs text-slate-600">
                            {Number(fr.home) > Number(fr.away) && String(fr.home).trim() !== "" && String(fr.away).trim() !== ""
                              ? "Home win"
                              : Number(fr.away) > Number(fr.home) && String(fr.home).trim() !== "" && String(fr.away).trim() !== ""
                                ? "Away win"
                                : "-"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">High breaks (30+)</p>
                    <div className="mt-2 space-y-2">
                      {breakEntries.map((row, idx) => (
                        <div key={`std-break-${idx}`} className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                          <select
                            value={row.playerKey}
                            onChange={(e) =>
                              setBreakEntries((prev) => prev.map((r, i) => (i === idx ? { ...r, playerKey: e.target.value } : r)))
                            }
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">Select player</option>
                            {breakPlayerOptions.map((o) => (
                              <option key={o.key} value={o.key}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <input
                            value={row.value}
                            onChange={(e) =>
                              setBreakEntries((prev) => prev.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r)))
                            }
                            placeholder="Break value"
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2"
                          />
                          <button
                            type="button"
                            onClick={() => setBreakEntries((prev) => prev.filter((_, i) => i !== idx))}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setBreakEntries((prev) => [...prev, { playerKey: "", value: "" }])}
                      className="mt-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700"
                    >
                      + Add break
                    </button>
                  </div>
                  <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                    {saving ? "Submitting..." : "Submit for approval"}
                  </button>
                </form>
              )}
            </section>
          ) : null}
        </RequireAuth>
      </div>
    </main>
  );
}
