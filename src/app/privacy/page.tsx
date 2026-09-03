"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PageNav from "@/components/PageNav";

const EFFECTIVE_DATE = "11 March 2026";
const LAST_UPDATED = "3 September 2026";
const USAGE_CONSENT_KEY = "rf_usage_tracking_consent";
const PRIVACY_EMAIL =
  process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim() ||
  process.env.NEXT_PUBLIC_OWNER_EMAIL?.trim() ||
  process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL?.trim() ||
  "";

type UsageChoice = "granted" | "denied" | "unset";

export default function PrivacyPage() {
  const [usageChoice, setUsageChoice] = useState<UsageChoice>("unset");

  useEffect(() => {
    const saved = window.localStorage.getItem(USAGE_CONSENT_KEY);
    setUsageChoice(saved === "granted" || saved === "denied" ? saved : "unset");
  }, []);

  function saveUsageChoice(choice: Exclude<UsageChoice, "unset">) {
    window.localStorage.setItem(USAGE_CONSENT_KEY, choice);
    if (choice === "denied") {
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith("usage:last:")) window.localStorage.removeItem(key);
      }
    }
    setUsageChoice(choice);
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-teal-50 via-slate-50 to-amber-50 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Legal</p>
              <h1 className="text-2xl font-bold text-slate-900">Privacy Policy</h1>
              <p className="mt-1 text-xs text-slate-600">Effective date: {EFFECTIVE_DATE} · Last updated: {LAST_UPDATED} · Version 2026-09-03</p>
            </div>
            <PageNav />
          </div>
        </section>

        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm">
          <p>This policy explains how Rack &amp; Frame League Manager uses personal information to operate the Gravesend &amp; District Indoor Games League, including its leagues, fixtures, results, player records, handicaps, knockout competitions and club invoicing.</p>

          <div>
            <h2 className="text-base font-semibold text-slate-900">1. Who is responsible for your information</h2>
            <p className="mt-2">The Gravesend &amp; District Indoor Games League is the data controller for league records and decides why and how that information is used. Martin Chamberlain, the League Secretary and System Owner, administers and secures Rack &amp; Frame on the League&apos;s behalf. League officers may handle requests as part of their authorised duties.</p>
            <p className="mt-2">Privacy enquiries may be sent to {PRIVACY_EMAIL ? <a className="font-semibold text-teal-700 underline" href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> : <span className="font-semibold">the League Secretary through the League&apos;s published contact channel</span>}.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">2. Information we collect</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Account information, including email address, user ID, account status, acceptance records and authentication information managed by Supabase.</li>
              <li>Player information, including name, club, team, role, date of birth where required, profile image, nationality and player-profile links.</li>
              <li>League and competition records, including line-ups, fixtures, frame scores, breaks, results, submissions, approvals, reports, Elo ratings, handicaps and historical trends.</li>
              <li>Contact information supplied for arranging matches or competitions, including telephone-sharing choices.</li>
              <li>Registration and competition-form information, including drafts, declarations, notes and information submitted by captains or club officers about other players.</li>
              <li>Administration and financial records, including competition entries, club invoice items, invoice recipients, payment status and audit history. Rack &amp; Frame does not currently process payment-card details.</li>
              <li>Technical and security information, including audit events, pages used where analytics permission is given, browser/device information, notification status and web-push subscription credentials.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">3. Where information comes from</h2>
            <p className="mt-2">Information may be supplied by you, a team captain or vice-captain, a club or league officer, an opponent recording a match by agreement, or generated from approved league and competition results. If you provide information about another person, you must ensure it is accurate and that the person knows it is being supplied to the League.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">4. Why we use information and our lawful bases</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Requested service or contract:</strong> creating and operating an account, accepting requested entries and providing app functions under the Terms &amp; Conditions.</li>
              <li><strong>Legitimate interests:</strong> administering the League fairly, publishing sporting records, calculating tables and handicaps, resolving disputes, maintaining historical results, communicating operational information, protecting the service and producing club invoices. We balance these interests against players&apos; privacy rights.</li>
              <li><strong>Consent:</strong> optional telephone sharing, web-push notifications and identified usage analytics. Consent can be withdrawn for future use.</li>
              <li><strong>Legal obligations:</strong> responding to data-protection requests and retaining records where accounting, tax or other law requires it.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">5. Public information and restricted information</h2>
            <p className="mt-2">Published league pages may show player names, clubs, teams, fixtures, line-ups, results, frame scores, breaks, rankings, Elo ratings, handicaps and sporting statistics. They do not intentionally publish account email addresses, full dates of birth, private telephone numbers or push-subscription credentials.</p>
            <p className="mt-2">League Secretary, Chairman and Treasurer accounts can access the information needed to run the League. The System Owner also has protected technical, security, backup and account-management access. Captains and vice-captains can access assigned team workflows and limited match-arranging information where sharing is authorised.</p>
            <p className="mt-2">Draft fixture reviews, registration drafts, competition drafts and club invoices may use long, unlisted access links. Anyone who receives such a link may be able to view the information it protects, so it must not be posted publicly or forwarded unnecessarily.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">6. Dates of birth and contact details</h2>
            <p className="mt-2">Dates of birth are used for identity checks and eligibility for age-restricted competitions such as Over 50s and Over 60s. A player may see or update their own date of birth, and the System Owner or authorised league officers may process it where necessary for validation or correction. Full dates of birth are not displayed on public league pages.</p>
            <p className="mt-2">The league team-registration form does not collect private match-arranging telephone numbers. The separate competition-entry process may require a captain or team contact name and telephone number. Player telephone numbers are disclosed only where the player has agreed and the recipient needs them to arrange a relevant match.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">7. Emails and push notifications</h2>
            <p className="mt-2">Transactional emails may be sent for account security, league administration or an optional registration receipt. A receipt email address is used for that requested copy and is not added to a player profile. Email delivery is provided through Resend and may create delivery and security logs.</p>
            <p className="mt-2">Push notifications are optional. If enabled, the app stores a browser-generated endpoint, subscription keys and user-agent information so a compatible device service can deliver league alerts. Notifications can be disabled in Rack &amp; Frame and in the device or browser settings.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">8. Device storage and optional usage analytics</h2>
            <p className="mt-2">Rack &amp; Frame uses browser storage and PWA caching for authentication, security, drafts, navigation, notification preferences and offline or installable-app functionality. These functions are necessary to provide features requested by the user. The app does not use advertising cookies.</p>
            <p className="mt-2">With your permission, the app may record your signed-in account, role and pages visited to diagnose problems and improve the service. This choice is optional and does not affect league access. You can change it below at any time; withdrawing permission stops future usage events.</p>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">Usage analytics choice</p>
              <p className="mt-1 text-xs text-slate-600">Current choice: {usageChoice === "granted" ? "Allowed" : usageChoice === "denied" ? "Not allowed" : "Not selected — analytics remain off"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => saveUsageChoice("granted")} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white">Allow usage analytics</button>
                <button type="button" onClick={() => saveUsageChoice("denied")} className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-800">Keep analytics off</button>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">9. Service providers and international processing</h2>
            <p className="mt-2">The League uses service providers including Supabase for database and authentication services, Vercel for application hosting, Resend for email delivery and browser/device push services for notifications. They process information under their own security and contractual arrangements. Some processing may occur outside the United Kingdom; where a restricted transfer occurs, the League relies on an applicable adequacy regulation or approved contractual safeguards.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">10. How long we keep information</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Approved fixtures, results, sporting statistics and handicap history may be retained as the League&apos;s permanent sporting archive.</li>
              <li>Account and current contact information is retained while the account or league relationship remains active and then reviewed for deletion, restriction or anonymisation.</li>
              <li>Drafts, unsuccessful requests, notification subscriptions and operational logs are retained only while needed for their purpose, troubleshooting, security or dispute resolution.</li>
              <li>Invoice and payment records are normally retained for up to six years after the relevant financial year where needed for accounting and dispute records.</li>
            </ul>
            <p className="mt-2">Records are reviewed periodically. Legal claims, safeguarding, security incidents or statutory obligations may require a longer period.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">11. Automated calculations</h2>
            <p className="mt-2">Rack &amp; Frame automatically calculates standings, Elo ratings and suggested handicaps from approved results. These are sporting calculations rather than decisions producing legal or similarly significant effects. Authorised league officers can review and correct the underlying records and apply League rules.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">12. Security</h2>
            <p className="mt-2">The app uses authenticated access, role-based permissions, database row-level security, approval workflows, audit records, protected server credentials and backup controls. No internet service is completely risk-free, so users must protect their accounts and report suspected unauthorised access promptly.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">13. Your rights and complaints</h2>
            <p className="mt-2">Depending on the circumstances, you may ask for access to your information, correction, deletion, restriction, portability, or object to processing based on legitimate interests. You may withdraw consent for future processing at any time. Some rights are not absolute, and limited sporting, audit, invoice or dispute records may be retained where there is a lawful reason.</p>
            <p className="mt-2">We normally respond within one month. Please contact the League first so the matter can be investigated. You may also complain to the Information Commissioner&apos;s Office at <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noreferrer" className="font-semibold text-teal-700 underline">ico.org.uk/make-a-complaint</a>.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">14. Changes to this policy</h2>
            <p className="mt-2">This policy may be updated when the app, League procedures or law changes. The version and last-updated date will be shown above. Material changes may also be notified in the app and may require renewed acknowledgement.</p>
          </div>

          <p className="pt-2"><Link href="/legal" className="font-semibold text-teal-700 underline underline-offset-4">Back to Legal &amp; Credits</Link></p>
        </section>
      </div>
    </main>
  );
}
