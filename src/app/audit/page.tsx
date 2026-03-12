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
  league_fixture_saved: "Saved fixture result",
  league_submission_sent: "Submitted fixture result",
  league_submission_approved: "Approved fixture result",
  league_submission_rejected: "Rejected fixture result",
};

function prettyAction(action: string) {
  return ACTION_LABELS[action] ?? action.replaceAll("_", " ");
}

export default function AuditPage() {
  const admin = useAdminStatus();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
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

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <RequireAuth>
          <ScreenHeader
            title="Audit Log"
            eyebrow="Super User"
            subtitle="Who did what and when across the league system."
          />
          {!admin.loading && !admin.isSuper ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              Only the Super User can access Audit Log.
            </section>
          ) : null}

          {admin.isSuper ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <MessageModal message={message} onClose={() => setMessage(null)} />
              <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  placeholder="Search by user, role, action, entity, or summary..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  Clear
                </button>
              </div>
              {loading ? <p className="text-sm text-slate-600">Loading audit log...</p> : null}
              {!loading && filtered.length === 0 ? <p className="text-sm text-slate-600">No audit entries.</p> : null}
              {!loading && filtered.length > 0 ? (
                <div className="overflow-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">When</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">Who</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">Role</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">Action</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">Entity</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr key={r.id} className="border-t border-slate-200">
                          <td className="px-3 py-2 text-slate-700">{new Date(r.created_at).toLocaleString()}</td>
                          <td className="px-3 py-2 text-slate-700">{r.actor_email || "-"}</td>
                          <td className="px-3 py-2 text-slate-700">{r.actor_role || "-"}</td>
                          <td className="px-3 py-2 font-medium text-slate-900" title={r.action}>
                            {prettyAction(r.action)}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {r.entity_type && r.entity_id ? `${r.entity_type}: ${r.entity_id.slice(0, 8)}` : "-"}
                          </td>
                          <td className="px-3 py-2 text-slate-700">{r.summary || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ) : null}
        </RequireAuth>
      </div>
    </main>
  );
}

