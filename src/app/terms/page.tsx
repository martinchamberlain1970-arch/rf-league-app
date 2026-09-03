"use client";

import Link from "next/link";
import PageNav from "@/components/PageNav";

const EFFECTIVE_DATE = "11 March 2026";
const LAST_UPDATED = "3 September 2026";
const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim() ||
  process.env.NEXT_PUBLIC_OWNER_EMAIL?.trim() ||
  process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL?.trim() ||
  "";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-teal-50 via-slate-50 to-amber-50 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Legal</p>
              <h1 className="text-2xl font-bold text-slate-900">Terms &amp; Conditions</h1>
              <p className="mt-1 text-xs text-slate-600">Effective date: {EFFECTIVE_DATE} · Last updated: {LAST_UPDATED} · Version 2026-09-03</p>
            </div>
            <PageNav />
          </div>
        </section>

        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm">
          <p>These terms govern use of Rack &amp; Frame League Manager for the Gravesend &amp; District Indoor Games League. They apply to the System Owner, League Secretary, Chairman, Treasurer, captains, vice-captains, players, club representatives and anyone using a public or protected form or link.</p>

          <div>
            <h2 className="text-base font-semibold text-slate-900">1. Operator and acceptance</h2>
            <p className="mt-2">The Gravesend &amp; District Indoor Games League operates the league service. Martin Chamberlain owns and technically administers the Rack &amp; Frame software. By creating an account, submitting an entry or using a protected league workflow, you agree to follow these terms, the Privacy Policy and the applicable League rules.</p>
            <p className="mt-2">Accounts for the current League are intended for people aged 18 or over. If the League later permits junior participation, separate guardian and safeguarding arrangements must be applied before an account or public profile is enabled.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">2. Accounts and access</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>You must provide accurate information, use your own account and keep your password and device access secure.</li>
              <li>Do not create a duplicate account or allow another person to act through your account. Agreed proxy result entry must use the app&apos;s authorised proxy process.</li>
              <li>Tell a league officer promptly if your account, role, linked player or team access is wrong or may have been compromised.</li>
              <li>League roles are managed by the League Secretary, Chairman or Treasurer. Protected ownership, backup, security and destructive system controls remain with the System Owner.</li>
              <li>Access may be restricted or removed where necessary to protect the League, investigate misuse, correct an incorrect role or when the user no longer requires access.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">3. Information entered about other people</h2>
            <p className="mt-2">Captains and club representatives may enter player names, roles, competition choices, contact details and dates of birth on behalf of other people. You must take reasonable steps to ensure the information is accurate, relevant to the League and supplied with the person&apos;s knowledge. You must not use another person&apos;s information for unrelated purposes.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">4. Team registration, line-ups and results</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Team registrations must identify the correct captain, vice-captain and intended squad. Registrations remain subject to league-officer review and approval.</li>
              <li>On league nights, the home side normally submits its line-up first, the away side confirms its line-up, and the home captain or vice-captain records every frame and submits the completed result.</li>
              <li>The away side should not submit a duplicate result. Proxy entry may be used only where both teams agree and the person entering the information checks it with both sides.</li>
              <li>Scores, player selections, forfeits, no-shows and qualifying breaks must be recorded accurately. Deliberately false or misleading submissions are prohibited.</li>
              <li>The League Secretary, Chairman or Treasurer may review, approve, reject, return or correct submissions in accordance with League rules and the audit record.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">5. Rankings, Elo and handicaps</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>League standings, player tables, Elo ratings and handicap recommendations are calculated from approved data.</li>
              <li>The 2026/27 Premier League uses the full reviewed handicap difference with no maximum start. Division 1 is played off scratch, although Elo history may still be recorded.</li>
              <li>No-show, void and nominated-player frames do not affect Elo or handicap where the current League rules exclude them.</li>
              <li>Authorised league officers may correct underlying records or apply a manual handicap decision where League rules require it.</li>
              <li>If an app calculation conflicts with an official League rule or recorded league-officer decision, the official League decision takes precedence and the data should be corrected.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">6. Competition entries and eligibility</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Entries must be made within the published opening and closing dates and remain subject to eligibility and league-officer approval.</li>
              <li>Age-restricted competitions require an accurate date of birth. Providing a false date or entering an ineligible player may invalidate the entry.</li>
              <li>A captain or team contact submitting a combined competition form is responsible for checking the selections with the players concerned.</li>
              <li>Withdrawals, replacements and corrections after a closing date are subject to League rules and officer approval.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">7. Fees and club invoices</h2>
            <p className="mt-2">The current scheduled entry fees are £30 for each league team, £3 for each individual competition entry other than the Mick White competition, and £5 for each Mick White team entry. The League may change future fees, but any change should be communicated before the relevant entry closes.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Approved league and competition entries may be consolidated into one invoice for each club, naming the relevant teams and entries.</li>
              <li>Invoices are payable using the instructions and due date shown on the invoice. Rack &amp; Frame does not currently collect payment-card details or process online card payments.</li>
              <li>Whether a late withdrawal, correction or rejected entry remains chargeable is determined by the League&apos;s rules and officers.</li>
              <li>Invoice links are unlisted but may display club, recipient, entry and payment information to anyone holding the link. Recipients must keep them within the relevant club.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">8. Public information and protected links</h2>
            <p className="mt-2">Player names, teams, fixtures, line-ups, results, breaks, tables, Elo ratings, handicaps and sporting statistics may appear on public league pages. Private contact details, account emails and full dates of birth must not be copied into public notes or shared unnecessarily.</p>
            <p className="mt-2">Registration drafts, competition drafts, draft fixture reviews and invoices may be protected by an unlisted link rather than an account login. A person using such a link must not publish it, forward it beyond those who need it, attempt to discover another protected link or continue using it after access is withdrawn.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">9. Notifications and email</h2>
            <p className="mt-2">Push notifications and optional confirmation emails are conveniences and are not guaranteed delivery channels. Users remain responsible for checking Rack &amp; Frame and official League communications. Notification permission may be withdrawn through the app, browser or device. An optional receipt email address must belong to the requester or be used with their permission.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">10. Acceptable use</h2>
            <p className="mt-2">You must use Rack &amp; Frame lawfully and respectfully. You must not impersonate another person, probe or bypass access controls, scrape private information, interfere with the service, upload harmful material, disclose protected links, manipulate records dishonestly or use player contact details for advertising or unrelated communications.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">11. Availability, changes and records</h2>
            <p className="mt-2">Reasonable efforts are made to keep the service secure, accurate and available, but uninterrupted or error-free operation cannot be guaranteed. Features may change to support League rules, security, legal compliance and operational needs. League officers may use audit records and backups to investigate or correct an issue.</p>
            <p className="mt-2">Users should report errors promptly and keep any information needed to verify a disputed result. Official League decisions and approved records remain authoritative even where a notification or optional email is delayed or not delivered.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">12. Intellectual property</h2>
            <p className="mt-2">Rack &amp; Frame League Manager © 2026 Martin Chamberlain. All rights reserved. Permission to use the app for authorised League activity does not transfer ownership of the software, branding, design or documentation. League and player data remains subject to the League&apos;s governance responsibilities and individual data-protection rights.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">13. Responsibility and liability</h2>
            <p className="mt-2">Rack &amp; Frame supports League administration; it does not replace the League constitution, competition rules, referee decisions or officer judgement. To the extent permitted by law, the League and System Owner are not responsible for indirect loss caused by unavailable devices, connectivity, inaccurate user submissions or events outside reasonable control. Nothing in these terms excludes liability that cannot lawfully be excluded or affects applicable statutory rights.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">14. Ending access and continuing records</h2>
            <p className="mt-2">You may ask for your account to be closed. Account closure does not automatically erase approved sporting, audit or invoice records that the League has a lawful reason to retain. The Privacy Policy explains the available rights and how requests are considered.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">15. Governing law and contact</h2>
            <p className="mt-2">These terms are governed by the law of England and Wales, and disputes are subject to the courts of England and Wales unless mandatory law provides otherwise. League, account or governance queries should be sent to the League Secretary, Chairman or Treasurer. Technical security and software-ownership matters may be escalated to the System Owner{CONTACT_EMAIL ? <> at <a className="font-semibold text-teal-700 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></> : " through the League's published contact channel"}.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">16. Changes to these terms</h2>
            <p className="mt-2">The version and last-updated date are shown above. Material changes may be announced in the app and may require users to acknowledge the revised terms before continuing to use protected features.</p>
          </div>

          <p className="pt-2"><Link href="/legal" className="font-semibold text-teal-700 underline underline-offset-4">Back to Legal &amp; Credits</Link></p>
        </section>
      </div>
    </main>
  );
}
