"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import { supabase } from "@/lib/supabase";
import useAdminStatus from "@/components/useAdminStatus";
import ConfirmModal from "@/components/ConfirmModal";
import MessageModal from "@/components/MessageModal";

type BackupPayload = {
  version: string;
  exported_at: string;
  [key: string]: unknown;
};

export default function BackupPage() {
  const admin = useAdminStatus();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [keepAccounts, setKeepAccounts] = useState(true);
  const [confirmText, setConfirmText] = useState("");
  const [restorePoints, setRestorePoints] = useState<Array<{ path: string; name: string; updated_at: string | null; source: "system" | "user" }>>([]);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: "default" | "danger";
    resolve?: (value: boolean) => void;
  }>({ open: false, title: "", description: "" });

  const askConfirm = (
    title: string,
    description: string,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    tone: "default" | "danger" = "default"
  ) =>
    new Promise<boolean>((resolve) => {
      setConfirmState({ open: true, title, description, confirmLabel, cancelLabel, tone, resolve });
    });

  const closeConfirm = (result: boolean) => {
    const resolver = confirmState.resolve;
    setConfirmState({ open: false, title: "", description: "" });
    resolver?.(result);
  };

  const getToken = async () => {
    const client = supabase;
    if (!client) return null;
    const { data: sessionRes } = await client.auth.getSession();
    return sessionRes.session?.access_token ?? null;
  };

  const loadRestorePoints = async () => {
    const token = await getToken();
    if (!token) return;
    const resp = await fetch("/api/admin/backup-points", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      setMessage(json?.error ?? "Failed to load restore points.");
      return;
    }
    setRestorePoints((json?.files ?? []) as Array<{ path: string; name: string; updated_at: string | null; source: "system" | "user" }>);
  };

  const restoreFromPoint = async (path: string) => {
    const token = await getToken();
    if (!token) {
      setMessage("You must be signed in.");
      return;
    }
    const ok = await askConfirm(
      "Restore this restore point?",
      `This will restore data from ${path} and may overwrite current records.`,
      "Restore",
      "Cancel",
      "danger"
    );
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    const resp = await fetch("/api/admin/backup-restore-point", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ path }),
    });
    const json = await resp.json().catch(() => ({}));
    setBusy(false);
    if (!resp.ok) {
      setMessage(json?.error ?? "Restore-point apply failed.");
      return;
    }
    setMessage(`Restore point applied: ${path}`);
  };

  const exportBackup = async () => {
    const token = await getToken();
    if (!token) {
      setMessage("You must be signed in.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const resp = await fetch("/api/admin/backup-export", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await resp.json().catch(() => ({}));
    setBusy(false);
    if (!resp.ok || !json?.payload) {
      setMessage(json?.error ?? "Backup export failed.");
      return;
    }
    const payload = json.payload as BackupPayload;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `league-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("Backup exported.");
    await loadRestorePoints();
  };

  const restoreBackup = async (file: File | null) => {
    if (!file) return;
    const token = await getToken();
    if (!token) {
      setMessage("You must be signed in.");
      return;
    }
    const ok = await askConfirm(
      "Restore backup?",
      "This will upsert data by ID and may overwrite current records.",
      "Restore",
      "Cancel",
      "danger"
    );
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as BackupPayload;
      const resp = await fetch("/api/admin/backup-restore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ payload }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setMessage(json?.error ?? "Restore failed.");
        setBusy(false);
        return;
      }
      setMessage("Restore complete.");
      await loadRestorePoints();
    } catch (err: any) {
      setMessage(err?.message ?? "Restore failed.");
    } finally {
      setBusy(false);
    }
  };

  const clearAllData = async () => {
    if (confirmText !== "DELETE ALL DATA") {
      setMessage('Type "DELETE ALL DATA" to continue.');
      return;
    }
    const ok = await askConfirm(
      "Reset app data?",
      "An automatic backup runs first. Then league data is reset to defaults.",
      "Reset now",
      "Cancel",
      "danger"
    );
    if (!ok) return;
    const token = await getToken();
    if (!token) {
      setMessage("You must be signed in.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const resp = await fetch("/api/admin/clear-data", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ keepAccounts, confirmText }),
    });
    const json = await resp.json().catch(() => ({}));
    setBusy(false);
    if (!resp.ok) {
      setMessage(json?.error ?? "Reset failed.");
      return;
    }
    const backupPath = json?.backupPath ? ` Backup: ${json.backupPath}` : "";
    setMessage(`Data reset complete.${backupPath}`);
    await loadRestorePoints();
  };

  useEffect(() => {
    void loadRestorePoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <RequireAuth>
          <ScreenHeader title="Data Management" eyebrow="Super User" subtitle="Backup, restore, and reset league data." />
          <MessageModal message={message} onClose={() => setMessage(null)} />

          {!admin.loading && !admin.isSuper ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              Only the Super User can access Data Management.
            </section>
          ) : null}

          {!admin.loading && admin.isSuper ? (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Backup</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Export a full JSON backup of league data.
                </p>
                <button
                  type="button"
                  onClick={exportBackup}
                  disabled={busy}
                  className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {busy ? "Working..." : "Export backup"}
                </button>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Restore</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Restore from a previously exported backup JSON file.
                </p>
                <input
                  type="file"
                  accept="application/json,.json"
                  disabled={busy}
                  className="mt-3 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  onChange={(e) => void restoreBackup(e.target.files?.[0] ?? null)}
                />
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">Restore Points</h2>
                  <button
                    type="button"
                    onClick={() => void loadRestorePoints()}
                    disabled={busy}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:opacity-60"
                  >
                    Refresh
                  </button>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  One-click restore from saved points in the backups bucket.
                </p>
                <div className="mt-3 space-y-2">
                  {restorePoints.length === 0 ? (
                    <p className="text-sm text-slate-600">No restore points found.</p>
                  ) : (
                    restorePoints.slice(0, 30).map((point) => (
                      <div key={point.path} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{point.name}</p>
                          <p className="text-xs text-slate-600">
                            {point.source === "system" ? "System" : "User"} · {point.updated_at ? new Date(point.updated_at).toLocaleString() : "Unknown date"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void restoreFromPoint(point.path)}
                          disabled={busy}
                          className="rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-sm text-emerald-700 disabled:opacity-60"
                        >
                          Restore point
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-rose-900">Reset App Data</h2>
                <p className="mt-1 text-sm text-rose-800">
                  Resets league data to defaults after an automatic backup.
                </p>
                <label className="mt-3 inline-flex items-center gap-2 text-sm text-rose-900">
                  <input
                    type="checkbox"
                    checked={keepAccounts}
                    onChange={(e) => setKeepAccounts(e.target.checked)}
                    disabled={busy}
                  />
                  Keep user accounts (recommended)
                </label>
                <input
                  className="mt-3 w-full rounded-xl border border-rose-300 bg-white px-3 py-2 text-sm"
                  placeholder='Type DELETE ALL DATA'
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={clearAllData}
                  disabled={busy}
                  className="mt-3 rounded-xl border border-rose-400 bg-white px-4 py-2 text-sm font-medium text-rose-700 disabled:opacity-60"
                >
                  {busy ? "Working..." : "Reset app data"}
                </button>
              </section>
            </>
          ) : null}
        </RequireAuth>
      </div>
      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={confirmState.confirmLabel}
        cancelLabel={confirmState.cancelLabel}
        tone={confirmState.tone}
        onConfirm={() => closeConfirm(true)}
        onCancel={() => closeConfirm(false)}
      />
    </main>
  );
}
