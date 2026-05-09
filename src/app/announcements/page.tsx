"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import MessageModal from "@/components/MessageModal";
import useAdminStatus from "@/components/useAdminStatus";
import { supabase } from "@/lib/supabase";
import ImportantAnnouncementBanner from "@/components/ImportantAnnouncementBanner";

type SiteAnnouncement = {
  id?: string;
  title?: string | null;
  body?: string | null;
  is_active?: boolean | null;
  updated_at?: string | null;
};

export default function AnnouncementsPage() {
  const admin = useAdminStatus();
  const [message, setMessage] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<SiteAnnouncement | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!admin.isSuper) return;
    let active = true;
    const load = async () => {
      const client = supabase;
      if (!client) return;
      const sessionRes = await client.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      if (!token) return;
      try {
        const res = await fetch("/api/admin/announcements", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = (await res.json().catch(() => ({}))) as { announcement?: SiteAnnouncement | null; error?: string };
        if (!active) return;
        if (!res.ok) {
          setMessage(payload.error ?? "Failed to load announcement.");
          return;
        }
        const row = payload.announcement ?? null;
        setAnnouncement(row);
        setTitle(row?.title ?? "");
        setBody(row?.body ?? "");
        setIsActive(Boolean(row?.is_active));
      } catch {
        if (!active) return;
        setMessage("Failed to load announcement.");
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [admin.isSuper]);

  const saveAnnouncement = async () => {
    const client = supabase;
    if (!client || !admin.isSuper) return;
    const sessionRes = await client.auth.getSession();
    const token = sessionRes.data.session?.access_token;
    if (!token) {
      setMessage("Session expired. Please sign in again.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          body,
          isActive,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage(payload.error ?? "Failed to save announcement.");
        return;
      }
      const next = isActive ? { title, body, is_active: true, updated_at: new Date().toISOString() } : null;
      setAnnouncement(next);
      setMessage("Announcement saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <RequireAuth>
          <ScreenHeader title="Announcements" eyebrow="Super User" subtitle="Create or update the important banner shown across the app and live screens." />
          <MessageModal message={message} onClose={() => setMessage(null)} />
          {!admin.isSuper ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">
              Only Super User can manage announcements.
            </section>
          ) : (
            <>
              <ImportantAnnouncementBanner announcement={announcement} />
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Important announcement banner</p>
                <p className="mt-1 text-sm text-slate-600">Use this for urgent notices that should appear on the live/public screens and user home page.</p>
                <div className="mt-3 grid gap-3">
                  <input
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Banner title"
                  />
                  <textarea
                    className="min-h-[140px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Banner message"
                  />
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                    Show this banner to users
                  </label>
                  <div>
                    <button
                      type="button"
                      onClick={() => void saveAnnouncement()}
                      disabled={saving}
                      className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 disabled:opacity-60"
                    >
                      {saving ? "Saving..." : "Save announcement"}
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}
        </RequireAuth>
      </div>
    </main>
  );
}
