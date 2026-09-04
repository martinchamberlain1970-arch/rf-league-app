"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Club = { id: string; name: string; submittedAt: string | null };
type Consultation = {
  slug: string;
  title: string;
  season_label: string;
  statement: string;
  closes_at: string | null;
  closed: boolean;
};

export default function HandicapConsultationPage({ params }: { params: Promise<{ slug: string }> }) {
  const [slug, setSlug] = useState("");
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [locationId, setLocationId] = useState("");
  const [attestorName, setAttestorName] = useState("");
  const [capacity, setCapacity] = useState("captain");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submittedClub, setSubmittedClub] = useState("");

  useEffect(() => {
    let active = true;
    void params.then(({ slug: resolvedSlug }) => {
      if (!active) return;
      setSlug(resolvedSlug);
      return fetch(`/api/public/handicap-consultation/${encodeURIComponent(resolvedSlug)}`, { cache: "no-store" });
    }).then(async (response) => {
      if (!response || !active) return;
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "The consultation could not be loaded.");
      setConsultation(payload.consultation);
      setClubs(payload.clubs ?? []);
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : "The consultation could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [params]);

  const completed = useMemo(() => clubs.filter((club) => club.submittedAt).length, [clubs]);
  const availableClubs = clubs.filter((club) => !club.submittedAt);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`/api/public/handicap-consultation/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, attestorName, capacity, agreed, website: "" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "The attestation could not be submitted.");
      setSubmittedClub(payload.clubName);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The attestation could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="min-h-screen bg-slate-100 p-4 sm:p-8"><p className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-sm">Loading consultation…</p></main>;

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-teal-950 to-slate-900 p-6 text-white shadow-xl sm:p-9">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-300">Rack &amp; Frame · League consultation</p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">{consultation?.title ?? "Handicap Consultation"}</h1>
          <p className="mt-3 text-slate-200">{consultation?.season_label}</p>
        </header>

        {error ? <section className="rounded-2xl border border-rose-300 bg-rose-50 p-5 text-rose-900">{error}</section> : null}

        {submittedClub ? (
          <section className="rounded-2xl border border-emerald-300 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-sm font-bold uppercase tracking-wider text-emerald-700">Attestation received</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Thank you</h2>
            <p className="mt-3 leading-7 text-slate-700">The written attestation for <strong>{submittedClub}</strong> has been recorded for review by the League Secretary and Chairman.</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">This confirms agreement to the shortened procedure only. It is not a vote for any particular handicap proposal.</p>
          </section>
        ) : consultation ? (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black text-slate-950">What you are confirming</h2>
              <p className="mt-3 leading-7 text-slate-700">The season begins on Thursday 10 September 2026. This form records whether every participating club agrees to shorten the normal proposal timetable for this one decision.</p>
              <p className="mt-4 rounded-xl bg-slate-100 p-4 font-semibold leading-7 text-slate-900">“{consultation.statement}”</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">One authorised captain or club representative should submit for each club. A separate vote on the three handicap proposals will follow only if every participating club attests.</p>
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-teal-50 px-3 py-2 font-bold text-teal-800">{completed} of {clubs.length} clubs received</span>
                {consultation.closes_at ? <span className="rounded-full bg-amber-50 px-3 py-2 font-bold text-amber-900">Closes {new Date(consultation.closes_at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}</span> : null}
              </div>
            </section>

            {consultation.closed ? (
              <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950">This consultation is now closed.</section>
            ) : (
              <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div>
                  <label htmlFor="club" className="block font-bold text-slate-900">Club represented</label>
                  <select id="club" value={locationId} onChange={(event) => setLocationId(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3">
                    <option value="">Select your club</option>
                    {availableClubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="name" className="block font-bold text-slate-900">Your full name</label>
                  <input id="name" value={attestorName} onChange={(event) => setAttestorName(event.target.value)} required autoComplete="name" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="First name and surname" />
                </div>
                <div>
                  <label htmlFor="capacity" className="block font-bold text-slate-900">Your authority to respond</label>
                  <select id="capacity" value={capacity} onChange={(event) => setCapacity(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3">
                    <option value="captain">Team captain responding for the club</option>
                    <option value="club_representative">Authorised club representative</option>
                  </select>
                </div>
                <label className="flex cursor-pointer gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm font-semibold leading-6 text-slate-800">
                  <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} required className="mt-1 h-5 w-5 shrink-0" />
                  <span>I have read the complete statement above and confirm it on behalf of the selected club.</span>
                </label>
                <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
                <button type="submit" disabled={busy || !locationId || !agreed} className="w-full rounded-xl bg-teal-700 px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Recording attestation…" : "Submit club attestation"}</button>
                <p className="text-xs leading-5 text-slate-500">Your name, club, role, statement and submission time will be retained as the league’s decision record. The League Secretary may contact the club through the existing captains’ group if verification is needed.</p>
              </form>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
