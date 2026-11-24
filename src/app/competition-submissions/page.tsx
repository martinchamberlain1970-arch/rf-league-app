"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import { supabase } from "@/lib/supabase";

type Team = {
  id: string;
  name: string;
  division: string;
  submission: { submittedAt: string; forms: number } | null;
};

const ukDateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/London",
});

export default function CompetitionSubmissionsPage() {
  return <RequireAuth><CompetitionSubmissions /></RequireAuth>;
}

function CompetitionSubmissions() {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const session = await supabase?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw new Error("Sign in to view team submissions.");
      const response = await fetch("/api/league/competition-submissions", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Team submissions could not be loaded.");
      setTeams(data.teams);
    } catch (err) {
      setTeams(null);
      setError(err instanceof Error ? err.message : "Team submissions could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submitted = teams?.filter((team) => team.submission) ?? [];
  const outstanding = teams?.filter((team) => !team.submission) ?? [];

  return (
    <main className="min-h-screen bg-slate-100 p-3 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <ScreenHeader
          title="Team form submissions"
          eyebrow="Competitions"
          subtitle="Track completed captain forms for the current league season. Saved drafts remain outstanding."
          actions={
            <button type="button" disabled={loading} onClick={() => void load()} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-60">
              {loading ? "Checking…" : "Refresh submissions"}
            </button>
          }
        />
        {error ? <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-900">{error}</p> : null}
        {loading && !teams ? <p role="status" className="p-4 text-slate-700">Checking team submissions…</p> : null}
        {teams ? (
          <>
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-teal-950">
              <p role="status" className="font-semibold">{submitted.length} of {teams.length} teams have submitted</p>
              <Link href="/signups#team-form-approvals" className="rounded-xl bg-teal-800 px-3 py-2 text-sm font-semibold text-white">
                Review team forms
              </Link>
            </section>
            {teams.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                <TeamList title="Submitted" teams={submitted} empty="No teams have submitted yet." />
                <TeamList title="Outstanding" teams={outstanding} empty="All teams have submitted." />
              </div>
            ) : <p className="rounded-xl bg-white p-4 text-slate-600">No active teams were found in the published seasons.</p>}
          </>
        ) : null}
      </div>
    </main>
  );
}

function TeamList({ title, teams, empty }: { title: string; teams: Team[]; empty: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-bold text-slate-900">{title} ({teams.length})</h2>
      {teams.length ? (
        <ul className="mt-2 divide-y divide-slate-100">
          {teams.map(({ id, name, division, submission }) => (
            <li key={id} className="py-2.5">
              <p className="font-semibold text-slate-900">{name}</p>
              <p className="text-xs text-slate-600">{division}</p>
              {submission ? (
                <p className="text-sm text-teal-800">
                  <time dateTime={submission.submittedAt}>{ukDateTime.format(new Date(submission.submittedAt))}</time>
                  {submission.forms > 1 ? <span className="ml-2 font-semibold text-amber-800">{submission.forms} forms received</span> : null}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-sm text-slate-600">{empty}</p>}
    </section>
  );
}
