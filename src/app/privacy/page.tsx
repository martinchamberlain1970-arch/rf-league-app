"use client";

import Link from "next/link";
import PageNav from "@/components/PageNav";

const EFFECTIVE_DATE = "11 March 2026";
const LAST_UPDATED = "11 March 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-teal-50 via-slate-50 to-amber-50 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Legal</p>
              <h1 className="text-2xl font-bold text-slate-900">Privacy Policy</h1>
              <p className="mt-1 text-xs text-slate-600">Effective date: {EFFECTIVE_DATE} · Last updated: {LAST_UPDATED}</p>
            </div>
            <PageNav />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 text-sm text-slate-700">
          <p>
            This policy explains how Rack &amp; Frame League Manager collects and uses personal data for league administration, fixtures, results, player stats, handicaps, and knockout competitions.
          </p>

          <div>
            <h2 className="text-base font-semibold text-slate-900">1. Data We Collect</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Account data: email address and encrypted authentication credentials.</li>
              <li>Profile data: player name, club/location, team, date of birth, and role assignment.</li>
              <li>Optional contact data: phone number and phone-sharing consent for match scheduling.</li>
              <li>League data: fixtures, frame scores, breaks (30+), submissions, approvals, standings, and reports.</li>
              <li>Governance data: audit log records, notifications, and access-control actions.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">2. Why We Use Data</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>To operate the league system and provide user login.</li>
              <li>To publish fixtures, record results, and maintain rankings/handicaps/statistics.</li>
              <li>To manage competition entries and eligibility checks (including age-based competitions).</li>
              <li>To secure the platform using role-based access, approvals, and audit records.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">3. Date of Birth and Age Eligibility</h2>
            <p className="mt-2">
              Date of birth is collected to validate eligibility for age-restricted competitions (for example Over 50s and Over 60s). Full date of birth is restricted to Super User level and is not displayed publicly.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">4. Who Can See What</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Super User: full governance, approvals, and operational administration.</li>
              <li>Captains/Vice-captains: team fixture result submissions for assigned teams.</li>
              <li>Players/Users: access to published fixtures, league tables, player tables, and their own relevant data.</li>
              <li>Phone number visibility follows player consent and may be used only for match scheduling.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">5. Legal Basis</h2>
            <p className="mt-2">
              Processing is based on league operations, legitimate interests in administering competitions, and your consent to platform terms at sign-up.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">6. Data Retention</h2>
            <p className="mt-2">
              Match and competition records are retained for league history, standings, and auditability. Account/profile deletion requests are handled through governance workflows and may preserve anonymized or non-identifying competition history where required for record integrity.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">7. Security</h2>
            <p className="mt-2">
              The app uses authenticated access, role-based controls, approval workflows, and audit logging to protect league data.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">8. Your Rights</h2>
            <p className="mt-2">
              You can request access, correction, or deletion of your data via league administration. Where deletion is requested, we may retain limited records necessary for compliance, audit, and historical league integrity.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">9. Contact</h2>
            <p className="mt-2">
              Contact the league secretary/chairman or system Super User for privacy requests and data corrections.
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
