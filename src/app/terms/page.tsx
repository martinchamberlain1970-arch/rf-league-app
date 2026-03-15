"use client";

import Link from "next/link";
import PageNav from "@/components/PageNav";

const EFFECTIVE_DATE = "11 March 2026";
const LAST_UPDATED = "11 March 2026";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-teal-50 via-slate-50 to-amber-50 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Legal</p>
              <h1 className="text-2xl font-bold text-slate-900">Terms &amp; Conditions</h1>
              <p className="mt-1 text-xs text-slate-600">Effective date: {EFFECTIVE_DATE} · Last updated: {LAST_UPDATED}</p>
            </div>
            <PageNav />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 text-sm text-slate-700">
          <p>
            These terms apply to all users of Rack &amp; Frame League Manager, including Super User, captains, vice-captains, and players.
          </p>

          <div>
            <h2 className="text-base font-semibold text-slate-900">1. Account and Access</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>You must provide accurate sign-up information.</li>
              <li>You are responsible for keeping your login credentials secure.</li>
              <li>Role-based permissions are controlled by the league Super User.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">2. Use of the Platform</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>The platform is for league administration, player records, fixtures, and competition management.</li>
              <li>Users must not submit false results, impersonate others, or bypass approval controls.</li>
              <li>Submitted captain/vice-captain results may be reviewed, approved, rejected, or corrected by Super User governance.</li>
              <li>If you share a phone number, it is for match scheduling communications only.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">3. Results, Rankings, and Handicaps</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>League standings and player tables are calculated from approved data.</li>
              <li>Snooker Elo ratings are updated from approved valid competitive frames.</li>
              <li>Snooker handicaps are reviewed from Elo and may be adjusted by up to 4 points per review cycle.</li>
              <li>No-show, void, and nominated-player frames do not affect Elo or handicap.</li>
              <li>Super User may apply manual handicap corrections where required by league rules.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">4. Competition Entries</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Entries must follow opening/closing windows and eligibility rules.</li>
              <li>Age-restricted competitions use recorded date of birth for validation.</li>
              <li>Competition entry and approval decisions are subject to league governance rules.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">5. Acceptable Conduct</h2>
            <p className="mt-2">
              You agree to use the app lawfully and respectfully. Abuse, unauthorized access attempts, or deliberate data manipulation may result in account restrictions.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">6. Service Changes</h2>
            <p className="mt-2">
              Features and workflows may be updated to support league operations, integrity checks, and governance needs.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">7. Disclaimer</h2>
            <p className="mt-2">
              The platform is provided to support league administration. While reasonable efforts are made for accuracy, users remain responsible for verifying official league decisions and published results.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">8. Contact</h2>
            <p className="mt-2">
              For account, governance, or legal queries, contact the league secretary/chairman or the system Super User.
            </p>
          </div>

          <p className="pt-2">
            <Link href="/legal" className="font-semibold text-teal-700 underline underline-offset-4">
              Back to Legal &amp; Credits
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
