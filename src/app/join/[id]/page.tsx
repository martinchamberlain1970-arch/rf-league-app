"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type PublicCompetition = {
  id: string;
  name: string;
  venue: string | null;
  sport_type: "snooker" | "billiards";
  competition_format: "knockout" | "league";
  match_mode: "singles" | "doubles";
  signup_open: boolean;
  signup_deadline: string | null;
  max_entries: number | null;
  is_completed: boolean;
};

export default function CompetitionInvitationPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [competition, setCompetition] = useState<PublicCompetition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const destination = useMemo(() => `/signups?competition=${encodeURIComponent(id)}`, [id]);

  useEffect(() => {
    fetch(`/api/public/competition-signup/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { competition?: PublicCompetition; error?: string };
        if (!response.ok || !payload.competition) throw new Error(payload.error || "Competition not found.");
        setCompetition(payload.competition);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Competition not found."));
  }, [id]);

  const deadlinePassed = Boolean(
    competition?.signup_deadline && Date.parse(competition.signup_deadline) < Date.now()
  );
  const entriesOpen = Boolean(competition?.signup_open && !competition.is_completed && !deadlinePassed);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.18),_transparent_34%),#f8fafc] px-4 py-8">
      <div className="mx-auto max-w-xl">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
          <div className="flex items-center gap-3">
            <img src="/rf-logo.png" alt="Rack & Frame League" className="h-14 w-14 rounded-xl bg-slate-950 object-contain p-2" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">Competition invitation</p>
              <p className="text-sm text-slate-500">Rack &amp; Frame League</p>
            </div>
          </div>

          {!competition && !error ? <p className="mt-8 text-slate-600">Loading competition…</p> : null}
          {error ? <p className="mt-8 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">{error}</p> : null}
          {competition ? (
            <>
              <h1 className="mt-8 text-3xl font-black tracking-tight text-slate-950">{competition.name}</h1>
              <div className="mt-4 space-y-1 text-sm text-slate-600">
                <p>{competition.sport_type === "billiards" ? "Billiards" : "Snooker"} · {competition.match_mode === "doubles" ? "Doubles" : "Singles"} · {competition.competition_format === "knockout" ? "Knockout" : "League"}</p>
                {competition.venue ? <p>Venue: {competition.venue}</p> : null}
                {competition.signup_deadline ? <p>Sign-up deadline: {new Date(competition.signup_deadline).toLocaleString()}</p> : null}
                {competition.max_entries ? <p>Maximum entries: {competition.max_entries}</p> : null}
              </div>

              {entriesOpen ? (
                <div className="mt-8 space-y-3">
                  <Link href={`/auth/sign-up?next=${encodeURIComponent(destination)}`} className="flex w-full justify-center rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white hover:bg-teal-800">
                    I’m new — create an account
                  </Link>
                  <Link href={`/auth/sign-in?next=${encodeURIComponent(destination)}`} className="flex w-full justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-800 hover:bg-slate-50">
                    I already have an account
                  </Link>
                  <p className="text-center text-xs leading-5 text-slate-500">New player profiles must be approved before the competition entry can be submitted.</p>
                </div>
              ) : (
                <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 font-medium text-amber-900">Sign-ups for this competition are closed.</p>
              )}
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
