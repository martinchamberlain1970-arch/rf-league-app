"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import MessageModal from "@/components/MessageModal";
import useAdminStatus from "@/components/useAdminStatus";
import { supabase } from "@/lib/supabase";

type AuditRow = {
  player_id: string;
  player_name: string;
  current_rating: number;
  latest_event_rating: number | null;
  rating_gap: number;
  current_handicap: number;
  target_handicap: number;
  handicap_gap: number;
  baseline_handicap: number;
  rated_matches_stored: number;
  rating_event_count: number;
  latest_event_at: string | null;
  form: {
    recent: string[];
    streak_label: string | null;
    wins_last_6: number;
    losses_last_6: number;
    high_break: number | null;
    breaks_30_plus: number;
    indicators: string[];
  };
  form_indicators: string[];
  flags: string[];
};

type AuditPayload = {
  generated_at: string;
  season: { id: string; name: string } | null;
  membership_source: string;
  summary: {
    total_players: number;
    players_with_any_flags: number;
    players_with_form_indicators: number;
    handicap_aligned: number;
    handicap_misaligned: number;
    rating_aligned: number;
    rating_misaligned: number;
    rated_match_count_aligned: number;
    rated_match_count_misaligned: number;
  };
  rows: AuditRow[];
  error?: string;
};

const formatSigned = (value: number | null | undefined) => {
  const next = Number(value ?? 0);
  return next > 0 ? `+${next}` : `${next}`;
};

const FLAG_LABELS: Record<string, string> = {
  handicap_not_aligned_to_elo: "Handicap not aligned to Elo",
  current_elo_differs_from_latest_rating_event: "Current Elo differs from latest rated event",
  rated_match_count_differs_from_rating_events: "Rated match count differs from rating events",
  unrated_player_has_non_default_values: "Unrated player has non-default values",
};

export default function RatingAuditPage() {
  const admin = useAdminStatus();
  const [data, setData] = useState<AuditPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [showOnlyIssues, setShowOnlyIssues] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const run = async () => {
      if (admin.loading) return;
      if (!admin.isSuper) {
        setLoading(false);
        return;
      }
      const client = supabase;
      if (!client) {
        setMessage("Supabase is not configured.");
        setLoading(false);
        return;
      }
      setLoading(true);
      const sessionRes = await client.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      if (!token) {
        setMessage("You must be signed in.");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/admin/elo-handicap-audit", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await res.json()) as AuditPayload;
      if (!res.ok) {
        setMessage(payload.error || "Failed to load Elo audit.");
        setLoading(false);
        return;
      }
      setData(payload);
      setLoading(false);
    };
    void run();
  }, [admin.loading, admin.isSuper]);

  const filteredRows = useMemo(() => {
    const rows = data?.rows ?? [];
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (showOnlyIssues && row.flags.length === 0 && row.form_indicators.length === 0) return false;
      if (!q) return true;
      return [row.player_name, ...row.flags, ...row.form_indicators].some((value) => value.toLowerCase().includes(q));
    });
  }, [data?.rows, query, showOnlyIssues]);

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <RequireAuth>
          <ScreenHeader
            title="Elo Audit"
            eyebrow="Super User"
            subtitle="Pulse check of live Elo values, handicap alignment, and rated-frame counts."
          />
          {!admin.loading && !admin.isSuper ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              Only the Super User can access Elo Audit.
            </section>
          ) : null}

          {admin.isSuper ? (
            <>
              <MessageModal message={message} onClose={() => setMessage(null)} />

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm text-slate-700">
                  This page checks three things:
                  {" "}current Elo versus the latest rating event,
                  {" "}current handicap versus the Elo-derived target,
                  {" "}and stored rated-frame count versus actual rating events.
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  If `handicap gap` is not `0`, the player's current handicap no longer matches the latest Elo target and should be brought back into line on the next review.
                </p>
                {data?.generated_at ? (
                  <p className="mt-2 text-xs text-slate-500">Generated {new Date(data.generated_at).toLocaleString()}</p>
                ) : null}
              </section>

              {data?.summary ? (
                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Published Players</p>
                    <p className="mt-2 text-3xl font-black text-slate-950">{data.summary.total_players}</p>
                  </div>
                  <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Players With Flags</p>
                    <p className="mt-2 text-3xl font-black text-slate-950">{data.summary.players_with_any_flags}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Handicap Aligned</p>
                    <p className="mt-2 text-3xl font-black text-slate-950">{data.summary.handicap_aligned}</p>
                    <p className="mt-1 text-xs text-slate-500">{data.summary.handicap_misaligned} not yet aligned</p>
                  </div>
                  <div className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Rating / Count Checks</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      Elo mismatches: {data.summary.rating_misaligned}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      Count mismatches: {data.summary.rated_match_count_misaligned}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Form Indicators</p>
                    <p className="mt-2 text-3xl font-black text-slate-950">{data.summary.players_with_form_indicators}</p>
                    <p className="mt-1 text-xs text-slate-500">Review signals only, not automatic handicap movement</p>
                  </div>
                </section>
              ) : null}

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 grid gap-2 lg:grid-cols-[1fr_auto_auto]">
                  <input
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    placeholder="Search player, issue, or form indicator..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowOnlyIssues((value) => !value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    {showOnlyIssues ? "Show all players" : "Show flags and indicators"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    Clear
                  </button>
                </div>

                {loading ? <p className="text-sm text-slate-600">Loading Elo audit...</p> : null}
                {!loading && filteredRows.length === 0 ? <p className="text-sm text-slate-600">No players match the current filter.</p> : null}
                {!loading && filteredRows.length > 0 ? (
                  <div className="overflow-auto rounded-xl border border-slate-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-700">Player</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-700">Elo</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-700">Latest Event Elo</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-700">Current Hcp</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-700">Target Hcp</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-700">Gap</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-700">Rated Frames</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-700">Form</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-700">Flags</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((row) => (
                          <tr key={row.player_id} className="border-t border-slate-200 align-top">
                            <td className="px-3 py-2 text-slate-800">
                              <Link href={`/players/${row.player_id}`} className="font-medium text-sky-700 underline-offset-2 hover:text-sky-900 hover:underline">
                                {row.player_name}
                              </Link>
                              {row.latest_event_at ? (
                                <p className="mt-1 text-xs text-slate-500">Latest rated event {new Date(row.latest_event_at).toLocaleDateString()}</p>
                              ) : (
                                <p className="mt-1 text-xs text-slate-500">No rating events recorded</p>
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              <span className="font-semibold text-slate-900">{row.current_rating}</span>
                              {row.rating_gap !== 0 ? <p className="mt-1 text-xs text-rose-700">Gap {formatSigned(row.rating_gap)}</p> : null}
                            </td>
                            <td className="px-3 py-2 text-slate-700">{row.latest_event_rating ?? "-"}</td>
                            <td className="px-3 py-2 text-slate-700">
                              <span className="font-semibold text-slate-900">{formatSigned(row.current_handicap)}</span>
                              <p className="mt-1 text-xs text-slate-500">Base {formatSigned(row.baseline_handicap)}</p>
                            </td>
                            <td className="px-3 py-2 text-slate-700">{formatSigned(row.target_handicap)}</td>
                            <td className={`px-3 py-2 font-semibold ${row.handicap_gap === 0 ? "text-emerald-700" : "text-amber-700"}`}>{formatSigned(row.handicap_gap)}</td>
                            <td className="px-3 py-2 text-slate-700">
                              <span className="font-semibold text-slate-900">{row.rated_matches_stored}</span>
                              <p className="mt-1 text-xs text-slate-500">Events {row.rating_event_count}</p>
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-600">
                              {row.form.recent.length > 0 ? (
                                <p className="mb-2 font-semibold text-slate-800">Last {row.form.recent.length}: {row.form.recent.join(" ")}</p>
                              ) : (
                                <p className="mb-2 text-slate-500">No completed frame form yet</p>
                              )}
                              {row.form_indicators.length > 0 ? (
                                <div className="space-y-1">
                                  {row.form_indicators.map((indicator) => (
                                    <p key={`${row.player_id}-${indicator}`} className="whitespace-pre-wrap break-words text-violet-700">
                                      {indicator}
                                    </p>
                                  ))}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-600">
                              {row.flags.length > 0 ? (
                                <div className="space-y-1">
                                  {row.flags.map((flag) => (
                                    <p key={`${row.player_id}-${flag}`} className="whitespace-pre-wrap break-words">
                                      {FLAG_LABELS[flag] ?? flag}
                                    </p>
                                  ))}
                                </div>
                              ) : (
                                <span className="font-semibold text-emerald-700">No flags</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
            </>
          ) : null}
        </RequireAuth>
      </div>
    </main>
  );
}
