"use client";

import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import useAdminStatus from "@/components/useAdminStatus";
import ScreenHeader from "@/components/ScreenHeader";
import MessageModal from "@/components/MessageModal";
import { supabase } from "@/lib/supabase";

type AuditRow = {
  id: string;
  created_at: string;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string | null;
  meta?: Record<string, unknown> | null;
};

const ACTION_LABELS: Record<string, string> = {
  auth_sign_in: "Signed in",
  auth_sign_up: "Created account",
  auth_sign_out: "Signed out",
  system_clear_data: "Reset app data",
  system_restore_backup: "Restored backup file",
  system_restore_point: "Restored restore point",
  league_proxy_entry_enabled: "Enabled proxy entry",
  league_home_lineup_submitted: "Submitted home lineup",
  league_away_lineup_submitted: "Submitted away lineup",
  league_live_progress_saved: "Saved live score progress",
  league_fixture_saved: "Saved fixture result",
  league_submission_sent: "Submitted fixture result",
  league_submission_approved: "Approved fixture result",
  league_submission_rejected: "Rejected fixture result",
  premier_handicap_auto_attested: "Auto-attested Premier handicap confirmation",
};

const AUDIT_PAGE_SIZE = 50;

function prettyAction(action: string) {
  return ACTION_LABELS[action] ?? action.replaceAll("_", " ");
}

function detailLines(meta?: Record<string, unknown> | null) {
  if (!meta) return [];
  const lines: string[] = [];
  const push = (label: string, value: unknown) => {
    if (value === null || typeof value === "undefined" || value === "") return;
    lines.push(`${label}: ${String(value)}`);
  };
  push("Fixture", meta.fixture_id);
  push("Date", meta.fixture_date);
  push("Submitted side", meta.submitted_side);
  push("Acting side", meta.acting_side);
  push("Proxy", typeof meta.proxy_entry_enabled === "boolean" ? (meta.proxy_entry_enabled ? "Yes" : "No") : meta.proxy_entry_used);
  push("Frame rows", meta.frame_rows_received);
  push("Completed frames", meta.completed_frames);
  push("Scored frames", meta.scored_frames);
  push("Frames with results", meta.frames_with_results);
  push("Recorded breaks", meta.recorded_breaks);
  push("Photo", meta.scorecard_photo_url ? "Attached" : null);
  push("Decision", meta.decision);
  push("Reason", meta.rejection_reason);
  push("Team", meta.team_name);
  push("Deadline", meta.deadline);
  push("Auto-attested", meta.auto_attested_at);
  push("Device", meta.user_agent);
  return lines;
}

export default function AuditPage() {
  const admin = useAdminStatus();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(AUDIT_PAGE_SIZE);
  const [message, setMessage] = useState<string | null>(null);

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
      const res = await client
        .from("audit_logs")
        .select("id,created_at,actor_email,actor_role,action,entity_type,entity_id,summary,meta")
        .order("created_at", { ascending: false })
        .limit(1500);
      if (res.error) setMessage(res.error.message);
      else setRows((res.data ?? []) as AuditRow[]);
      setLoading(false);
    };
    run();
  }, [admin.loading, admin.isSuper]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.actor_email, r.actor_role, r.action, r.entity_type, r.entity_id, r.summary]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [rows, query]);

  useEffect(() => {
    setVisibleCount(AUDIT_PAGE_SIZE);
  }, [query]);

  const visibleRows = filtered.slice(0, visibleCount);

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <RequireAuth>
          <ScreenHeader
            title="Audit Log"
            eyebrow="System Owner"
            subtitle="Who did what and when across the league system."
          />
          {!admin.loading && !admin.isSuper ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              Only the System Owner can access the Audit Log.
            </section>
          ) : null}

          {admin.isSuper ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <MessageModal message={message} onClose={() => setMessage(null)} />
              <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Activity history</p>
                  <h2 className="mt-1 text-xl font-black text-slate-950">{filtered.length.toLocaleString()} audit entr{filtered.length === 1 ? "y" : "ies"}</h2>
                  <p className="mt-1 text-sm text-slate-600">Most recent activity appears first. Open an entry only when you need its technical details.</p>
                </div>
                <p className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                  Showing {Math.min(visibleCount, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}
                </p>
              </div>
              <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
                  placeholder="Search by user, role, action, entity, or summary..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:border-teal-300 hover:bg-teal-50"
                >
                  Clear
                </button>
              </div>
              {loading ? <p className="text-sm text-slate-600">Loading audit log...</p> : null}
              {!loading && filtered.length === 0 ? <p className="text-sm text-slate-600">No audit entries.</p> : null}
              {!loading && filtered.length > 0 ? (
                <div className="space-y-3">
                  {visibleRows.map((row) => {
                    const details = detailLines(row.meta);
                    return (
                      <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-200 hover:shadow-md">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800" title={row.action}>
                                {prettyAction(row.action)}
                              </span>
                              {row.actor_role ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-600">{row.actor_role}</span> : null}
                            </div>
                            <p className="mt-3 break-words text-base font-bold text-slate-950">{row.actor_email || "System activity"}</p>
                            <p className="mt-2 break-words text-sm leading-6 text-slate-700">{row.summary || "No summary was recorded."}</p>
                          </div>
                          <time className="shrink-0 text-sm font-semibold text-slate-500" dateTime={row.created_at}>
                            {new Date(row.created_at).toLocaleString("en-GB")}
                          </time>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          {row.entity_type ? <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-semibold">{row.entity_type}</span> : null}
                          {row.entity_id ? <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono">ID {row.entity_id.slice(0, 8)}</span> : null}
                        </div>

                        {details.length > 0 ? (
                          <details className="mt-3 border-t border-slate-100 pt-3">
                            <summary className="cursor-pointer list-none text-sm font-bold text-teal-700 marker:hidden">
                              View technical details ({details.length}) <span aria-hidden="true">›</span>
                            </summary>
                            <div className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-2">
                              {details.map((line) => (
                                <p key={`${row.id}-${line}`} className="break-all rounded-lg border border-slate-200 bg-white px-3 py-2">
                                  {line}
                                </p>
                              ))}
                            </div>
                          </details>
                        ) : null}
                      </article>
                    );
                  })}

                  {visibleCount < filtered.length ? (
                    <div className="flex justify-center pt-2">
                      <button
                        type="button"
                        onClick={() => setVisibleCount((current) => current + AUDIT_PAGE_SIZE)}
                        className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm hover:border-teal-300 hover:bg-teal-50"
                      >
                        Load 50 more entries
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
        </RequireAuth>
      </div>
    </main>
  );
}
