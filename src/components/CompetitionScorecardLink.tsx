"use client";

import { useState } from "react";
import { competitionDeadlineLabel } from "@/lib/fixed-competition-handicaps";
import { supabase } from "@/lib/supabase";

export default function CompetitionScorecardLink({ matchId }: { matchId: string }) {
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const updateLink = async (action: "issue" | "revoke") => {
    setStatus("");
    setBusy(true);
    try {
      const session = await supabase?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw new Error("Sign in again to manage the scorecard link.");
      const response = await fetch("/api/competition/scorecard-links", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ matchId, action }),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The link could not be updated.");
      if (action === "revoke") {
        setLink(null);
        setStatus("Any previous link has been revoked.");
      } else {
        setLink({ url: new URL(data.path, window.location.origin).href, expiresAt: data.expiresAt });
        setStatus("New link ready to copy.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The link could not be updated.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="font-semibold text-slate-900">Private scorecard link</h2>
      <p className="mt-1 text-sm text-slate-600">Share it privately with someone playing this match. It expires after seven days or when the scorecard is submitted. Creating a new link replaces the previous one.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void updateLink("issue")} className="rounded-lg bg-teal-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">Create new link</button>
        <button type="button" disabled={busy} onClick={() => void updateLink("revoke")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-60">Revoke link</button>
      </div>
      {link ? (
        <div className="mt-3">
          <label className="block text-sm font-medium">
            Private link
            <input readOnly value={link.url} onFocus={(event) => event.currentTarget.select()} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <p className="mt-1 text-xs text-slate-600">Expires {competitionDeadlineLabel(link.expiresAt)} UK time</p>
          <button type="button" className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={async () => {
            try {
              await navigator.clipboard.writeText(link.url);
              setStatus("Link copied.");
            } catch {
              setStatus("Select the link above and copy it manually.");
            }
          }}>Copy link</button>
        </div>
      ) : null}
      {status ? <p className="mt-2 text-sm text-slate-700" role="status">{status}</p> : null}
    </section>
  );
}
