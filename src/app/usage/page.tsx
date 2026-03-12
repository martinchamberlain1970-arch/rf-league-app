"use client";

import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import useAdminStatus from "@/components/useAdminStatus";
import MessageModal from "@/components/MessageModal";
import { supabase } from "@/lib/supabase";

type UsageRow = {
  id: string;
  created_at: string;
  actor_email: string | null;
  actor_role: string | null;
  path: string;
};

type WindowKey = "24h" | "7d" | "30d";

export default function UsagePage() {
  const admin = useAdminStatus();
  const [windowKey, setWindowKey] = useState<WindowKey>("7d");
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const sinceIso = useMemo(() => {
    const now = Date.now();
    const ms =
      windowKey === "24h"
        ? 24 * 60 * 60 * 1000
        : windowKey === "7d"
          ? 7 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000;
    return new Date(now - ms).toISOString();
  }, [windowKey]);

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
        .from("usage_events")
        .select("id,created_at,actor_email,actor_role,path")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(7000);
      if (res.error) setMessage(res.error.message);
      else setRows((res.data ?? []) as UsageRow[]);
      setLoading(false);
    };
    run();
  }, [admin.loading, admin.isSuper, sinceIso]);

  const totals = useMemo(() => {
    const byPath = new Map<string, number>();
    const byUser = new Map<string, number>();
    let ownerOrAdminViews = 0;
    let userViews = 0;
    for (const r of rows) {
      byPath.set(r.path, (byPath.get(r.path) ?? 0) + 1);
      byUser.set(r.actor_email ?? "unknown", (byUser.get(r.actor_email ?? "unknown") ?? 0) + 1);
      if (r.actor_role === "owner" || r.actor_role === "admin") ownerOrAdminViews += 1;
      else userViews += 1;
    }
    return {
      total: rows.length,
      ownerOrAdminViews,
      userViews,
      topPaths: Array.from(byPath.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15),
      topUsers: Array.from(byUser.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15),
    };
  }, [rows]);

  const activeUsers = useMemo(() => {
    const cutoff = Date.now() - 15 * 60 * 1000;
    const byEmail = new Map<string, { email: string; role: string; lastSeen: string; lastPath: string; views: number }>();
    for (const r of rows) {
      const ts = new Date(r.created_at).getTime();
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      const email = r.actor_email ?? "unknown";
      const existing = byEmail.get(email);
      if (!existing) {
        byEmail.set(email, {
          email,
          role: r.actor_role ?? "user",
          lastSeen: r.created_at,
          lastPath: r.path,
          views: 1,
        });
      } else {
        existing.views += 1;
        if (new Date(existing.lastSeen).getTime() < ts) {
          existing.lastSeen = r.created_at;
          existing.lastPath = r.path;
          existing.role = r.actor_role ?? existing.role;
        }
      }
    }
    return Array.from(byEmail.values()).sort(
      (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
    );
  }, [rows]);

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <RequireAuth>
          <ScreenHeader
            title="Usage Analytics"
            eyebrow="Super User"
            subtitle="Who is using the system and what pages they are viewing."
          />
          {!admin.loading && !admin.isSuper ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              Only the Super User can access Usage Analytics.
            </section>
          ) : null}
          {admin.isSuper ? (
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <MessageModal message={message} onClose={() => setMessage(null)} />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setWindowKey("24h")}
                  className={`rounded-full border px-3 py-1 text-sm ${windowKey === "24h" ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-700"}`}
                >
                  Last 24h
                </button>
                <button
                  type="button"
                  onClick={() => setWindowKey("7d")}
                  className={`rounded-full border px-3 py-1 text-sm ${windowKey === "7d" ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-700"}`}
                >
                  Last 7d
                </button>
                <button
                  type="button"
                  onClick={() => setWindowKey("30d")}
                  className={`rounded-full border px-3 py-1 text-sm ${windowKey === "30d" ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-700"}`}
                >
                  Last 30d
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Total page views</p>
                  <p className="text-xl font-semibold text-slate-900">{totals.total}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Owner/Admin views</p>
                  <p className="text-xl font-semibold text-slate-900">{totals.ownerOrAdminViews}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">User views</p>
                  <p className="text-xl font-semibold text-slate-900">{totals.userViews}</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">Active Users (last 15 minutes)</p>
                  <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {activeUsers.length}
                  </span>
                </div>
                {activeUsers.length === 0 ? (
                  <p className="text-sm text-slate-600">No active users in the last 15 minutes.</p>
                ) : (
                  <div className="space-y-2">
                    {activeUsers.map((u) => (
                      <div key={u.email} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{u.email}</p>
                          <p className="text-xs text-slate-600">
                            Role: {u.role} · Last page: {u.lastPath}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500">{new Date(u.lastSeen).toLocaleTimeString()}</p>
                          <p className="text-xs font-semibold text-slate-700">{u.views} view{u.views === 1 ? "" : "s"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {loading ? <p className="text-sm text-slate-600">Loading usage events...</p> : null}

              {!loading ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">Top Pages</p>
                    <div className="mt-2 space-y-2">
                      {totals.topPaths.map(([path, count]) => (
                        <div key={path} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <span className="text-sm text-slate-800">{path}</span>
                          <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{count}</span>
                        </div>
                      ))}
                      {totals.topPaths.length === 0 ? <p className="text-sm text-slate-600">No page views yet.</p> : null}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">Top Users</p>
                    <div className="mt-2 space-y-2">
                      {totals.topUsers.map(([email, count]) => (
                        <div key={email} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <span className="text-sm text-slate-800">{email}</span>
                          <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{count}</span>
                        </div>
                      ))}
                      {totals.topUsers.length === 0 ? <p className="text-sm text-slate-600">No user activity yet.</p> : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {!loading && rows.length > 0 ? (
                <div className="overflow-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">When</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">Who</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">Role</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">Page</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 300).map((r) => (
                        <tr key={r.id} className="border-t border-slate-200">
                          <td className="px-3 py-2 text-slate-700">{new Date(r.created_at).toLocaleString()}</td>
                          <td className="px-3 py-2 text-slate-700">{r.actor_email || "-"}</td>
                          <td className="px-3 py-2 text-slate-700">{r.actor_role || "-"}</td>
                          <td className="px-3 py-2 text-slate-900">{r.path}</td>
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
