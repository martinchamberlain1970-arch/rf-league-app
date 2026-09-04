"use client";

import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import useAdminStatus from "@/components/useAdminStatus";
import { appRoleLabel } from "@/lib/app-roles";

const sharedAccess = [
  ["Results and corrections", "Review league and competition submissions, approve correct results, return or reject incorrect cards, and deal with fixture-date requests."],
  ["League operation", "Set up leagues, teams, venues and fixtures; publish competitions and maintain league records."],
  ["Players and handicaps", "Review player records, claims, Elo history and handicap changes where league rules require officer action."],
  ["Registrations and competitions", "Review team registrations, competition entries, draws and submitted competition results."],
  ["Club invoicing", "Preview the live charges, check blockers and generate one combined invoice per club after entries have closed and been approved."],
  ["Communications", "Publish announcements, review notifications and access league documents."],
] as const;

const roleGuides = [
  {
    title: "League Secretary",
    tone: "border-sky-200 bg-sky-50",
    summary: "Leads the day-to-day administration of the league and keeps the official records current.",
    responsibilities: [
      "Create and publish league seasons, teams, fixtures, break weeks and competition entry windows.",
      "Monitor the Results Queue and make sure submitted cards are reviewed promptly.",
      "Maintain team registrations, captain and vice-captain records, player records and league documents.",
      "Coordinate corrections, fixture changes, announcements and communications with clubs.",
      "Work with the Chairman on disputed results and with the Treasurer before invoices are issued.",
    ],
  },
  {
    title: "League Chairman",
    tone: "border-violet-200 bg-violet-50",
    summary: "Provides governance and shares full operational cover with the League Secretary.",
    responsibilities: [
      "Approve results and competition submissions, particularly when the Secretary is unavailable.",
      "Oversee disputes, exceptional fixture requests and interpretation of league rules.",
      "Check that league decisions are applied consistently and that reasons are recorded when a submission is returned or rejected.",
      "Support season setup, fixtures, player administration and communications as required.",
      "Review invoice previews with the Treasurer where club entries or charges need confirmation.",
    ],
  },
  {
    title: "League Treasurer",
    tone: "border-emerald-200 bg-emerald-50",
    summary: "Leads league finance while also sharing result-approval and league-operation access.",
    responsibilities: [
      "Confirm the current fee schedule before each invoice run: league teams, individual competitions and Mick White team entries.",
      "Wait until the selected competitions have closed and pending entries have been resolved.",
      "Preview club invoices, check the named teams and entrants, then generate and share the approved invoices.",
      "Retain the generated invoice run as the league record and coordinate payment queries with club captains.",
      "Approve results and provide operational cover for the Secretary and Chairman when needed.",
    ],
  },
] as const;

export default function LeagueOfficerGuidePage() {
  const admin = useAdminStatus();
  const roleLabel = appRoleLabel(admin.role);

  return (
    <RequireAuth>
      <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <ScreenHeader
            title="League Officer Guides"
            eyebrow="Governance"
            subtitle="Operating guidance for the League Secretary, League Chairman and League Treasurer."
            actions={admin.canManageLeague ? <span className="rounded-full border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800">Your access: {roleLabel}</span> : null}
          />

          <section className="rounded-2xl border border-teal-200 bg-teal-50 p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">Shared league-officer access</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              All three officer roles can run the league, approve results and use Club Invoices. Responsibility can be shared without using the System Owner account.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {sharedAccess.map(([title, description]) => (
                <div key={title} className="rounded-xl border border-teal-100 bg-white p-4">
                  <h3 className="font-bold text-slate-900">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/results" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">Open Results Queue</Link>
              <Link href="/league-invoices" className="rounded-xl border border-teal-300 bg-white px-4 py-2 text-sm font-bold text-teal-900">Open Club Invoices</Link>
              <Link href="/handicap-consultation-review" className="rounded-xl border border-teal-300 bg-white px-4 py-2 text-sm font-bold text-teal-900">Review Handicap Consultation</Link>
              <Link href="/league" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700">Open League Manager</Link>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            {roleGuides.map((guide) => (
              <article key={guide.title} className={`rounded-2xl border p-5 shadow-sm ${guide.tone}`}>
                <h2 className="text-xl font-bold text-slate-950">{guide.title}</h2>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-700">{guide.summary}</p>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
                  {guide.responsibilities.map((responsibility) => <li key={responsibility}>{responsibility}</li>)}
                </ul>
              </article>
            ))}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">Result approval checklist</h2>
            <ol className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                "Open Results Queue and select the pending league or competition submission.",
                "Check the fixture, players, frame winners, points, forfeits, nominated players and any recorded 30+ breaks.",
                "Approve only when the full card agrees with the submitted match result.",
                "If something is wrong, return or reject it with a useful reason so the captain knows exactly what to correct.",
                "After approval, confirm the fixture, tables and player records have updated as expected.",
                "Use the audit trail and league documents when a decision needs a permanent explanation.",
              ].map((step, index) => (
                <li key={step} className="flex gap-3 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm">
            <h2 className="text-lg font-bold">System Owner boundary</h2>
            <p className="mt-2 text-sm leading-6">
              League officers do not need System Owner access. Protected role assignment, platform security, full backup and restore, destructive data controls, usage administration and the system audit area remain owner-only responsibilities.
            </p>
          </section>
        </div>
      </main>
    </RequireAuth>
  );
}
