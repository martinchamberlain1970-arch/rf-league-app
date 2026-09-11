import Link from "next/link";
import ScreenHeader from "@/components/ScreenHeader";

const steps = [
  {
    title: "1. Set up your account",
    bullets: [
      "Register once using your own email address, then sign in with that same account each time.",
      "Claim your existing player profile if the app asks you to. Do not create a second profile because your results and statistics belong to the existing record.",
      "If you cannot find your profile, or the name or club is wrong, send a player update request or ask your captain or a league officer for help.",
      "Allow notifications if you want reminders and updates on that device. Email notifications can be controlled separately in Notification Settings.",
    ],
  },
  {
    title: "2. Before match night",
    bullets: [
      "Use League Manager to check your fixture, venue, opponent and scheduled date.",
      "Check Notifications for anything that needs your attention, including fixture changes and competition messages.",
      "Use Handicaps to check the current published handicap list. Your player profile also shows your personal record and history.",
      "Tell your captain as early as possible if you are unavailable. Captains and vice-captains manage the official team lineup.",
    ],
  },
  {
    title: "3. On match night",
    bullets: [
      "Arrive in time for the match to start as scheduled and confirm your availability with your captain.",
      "Your captain or vice-captain handles the official lineup and match result in Captain Results; ordinary players do not need to enter the team scorecard.",
      "Check that your name is selected for the correct frame before play begins.",
      "Tell the person entering the score immediately about any break of 30 or more so it is recorded against the correct player and frame.",
      "Snooker takes priority. Do not delay play to operate the app; the captain can complete or check the entry between frames or after the match.",
    ],
  },
  {
    title: "4. After the match",
    bullets: [
      "Check the published result once it has been approved. Approved results update the league table, player record and applicable Elo history.",
      "If your name, frame, score or break is wrong, tell your captain or a league officer promptly—do not submit a second result.",
      "You can continue to view fixtures, results, tables and public league information without taking any further action.",
    ],
  },
  {
    title: "5. Entering competitions",
    bullets: [
      "Open Competition Sign-ups and choose the correct event before entering.",
      "For doubles or triples, check your teammates carefully before submitting.",
      "Age-restricted competitions require a valid date of birth on your profile.",
      "If an entry is already shown as pending or approved, do not enter again. Ask a league officer if it needs correcting.",
    ],
  },
  {
    title: "6. When you need help",
    bullets: [
      "If you cannot sign in, use the password-reset option rather than creating another account.",
      "If your account is not linked to the correct player, use the claim process or contact a league officer.",
      "If a screen appears to be missing, your account may not have the role required for it. Captains and vice-captains should ask a league officer to check their team role.",
      "Give the League Secretary time to respond on match evenings unless the issue is preventing the match from continuing.",
    ],
  },
];

const appAreas = [
  { title: "League Manager", detail: "Fixtures, results, league tables and player tables.", href: "/league" },
  { title: "My Events", detail: "Your upcoming league and competition activity.", href: "/events" },
  { title: "Notifications", detail: "Reminders, requests and league messages.", href: "/notifications" },
  { title: "Competition Sign-ups", detail: "Enter open individual and team competitions.", href: "/signups" },
  { title: "Handicaps", detail: "Current published handicaps and an explanation of the system.", href: "/display/handicaps" },
  { title: "Captain Guide", detail: "Use this if you are assigned as captain or vice-captain.", href: "/captain-guide" },
];

export default function PlayerGuidePage() {
  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <ScreenHeader title="Player Guide" eyebrow="League Help" subtitle="A simple guide to using the app before, during and after match night." />

        <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-emerald-950">The most important things to remember</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <p className="rounded-xl bg-white p-4 text-sm text-slate-700"><strong>One account, one profile.</strong><br />Claim your existing player record rather than creating duplicates.</p>
            <p className="rounded-xl bg-white p-4 text-sm text-slate-700"><strong>Your captain enters the result.</strong><br />Ordinary players only need to check their details are correct.</p>
            <p className="rounded-xl bg-white p-4 text-sm text-slate-700"><strong>Report problems promptly.</strong><br />Tell your captain or a league officer if a result or break is wrong.</p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {steps.map((step) => (
            <article key={step.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">{step.title}</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
                {step.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
              </ul>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Where to go in the app</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {appAreas.map((area) => (
              <div key={area.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-900">{area.title}</h3>
                <p className="mt-1 text-sm text-slate-700">{area.detail}</p>
                <Link href={area.href} className="mt-3 inline-flex rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">Open</Link>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
