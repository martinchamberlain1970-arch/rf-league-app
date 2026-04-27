import Link from "next/link";
import ScreenHeader from "@/components/ScreenHeader";

const sections = [
  {
    title: "1. First check after sign-in",
    bullets: [
      "Sign in using your normal league-app account.",
      "If you have been assigned as captain or vice-captain, your dashboard and notifications will reflect that automatically.",
      "If Captain Results or the relevant fixture permissions are missing, contact the Super User rather than creating a second account.",
    ],
  },
  {
    title: "2. Before the match starts",
    bullets: [
      "Open Notifications regularly. This is where lineup prompts, fixture reminders, and league messages appear.",
      "If the home team has submitted a pre-match lineup, the away captain will see an inbox prompt to complete the away lineup before 19:30.",
      "Use notifications as the starting point when the system is prompting you to act.",
      "If your fixture is using digital pre-match lineups, the home side enters its lineup first on the day of the fixture.",
      "The away side can then respond before the fixture start time.",
      "Once both teams have submitted, the lineup is locked and those player assignments flow into the result card.",
      "If both teams agree to use paper instead, select the paper-record option so the system records that digital lineups were intentionally skipped.",
      "The key deadline is before 19:30: if a lineup needs to be submitted in the app, it must be done before the match starts.",
    ],
  },
  {
    title: "3. During the match",
    bullets: [
      "Open Captain Results and select the relevant fixture.",
      "Enter the frame players carefully. For summer leagues, remember the two-singles-per-player rule. For winter leagues, check nominated-player and no-show rules before submitting.",
      "Enter frame points accurately and add any qualifying breaks.",
      "Use Save progress if you need to stop and return before final submission.",
    ],
  },
  {
    title: "4. After the match finishes",
    bullets: [
      "League rule: the home team should submit the result by default unless the Super User has agreed another arrangement.",
      "Check the full card before submitting, especially player assignments, points, and breaks.",
      "Add the scorecard photo URL if your process requires it.",
      "Submit the result when complete. The submission then moves into the Super User review queue.",
      "Result deadline: the match result must be entered by midnight on the following day.",
      "WhatsApp results should be treated as an exception or backup route only. The normal expectation is that the result is submitted in the app so the system can update automatically after approval.",
      "Only approved results update the league table, player records, and Elo-driven handicap history.",
    ],
  },
  {
    title: "5. If something needs correcting",
    bullets: [
      "If a fixture needs moving, use the fixture date request process rather than relying only on an informal message.",
      "If you spot an error before submission, correct it immediately in Captain Results.",
      "If you spot an error after submission, contact the Super User. They can return the result for correction or amend it during review.",
    ],
  },
];

const appAreas = [
  {
    title: "Notifications",
    detail: "Your inbox for lineup prompts, reminders, and league messages.",
    href: "/notifications",
  },
  {
    title: "Captain Results",
    detail: "Where captains and vice-captains handle pre-match lineups, save drafts, and submit fixture results.",
    href: "/captain-results",
  },
  {
    title: "Handicaps / Help",
    detail: "Use these pages for current handicap guidance and wider league help.",
    href: "/help",
  },
];

export default function CaptainGuidePage() {
  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <ScreenHeader
          title="Captain / Vice-captain Guide"
          eyebrow="League Help"
          subtitle="How captains and vice-captains use the system once their role has been assigned."
        />

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Using the system</h2>
          <p className="mt-1 text-sm text-slate-600">
            This guide assumes your account is already registered and the Super User has assigned your captain or vice-captain role.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Before 19:30</p>
              <p className="mt-1 text-sm text-amber-900">Complete any required pre-match lineup activity before the fixture starts.</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Home team default</p>
              <p className="mt-1 text-sm text-emerald-900">The home team should normally submit the result in the app.</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Result deadline</p>
              <p className="mt-1 text-sm text-sky-900">Submit the result by midnight on the following day.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <article key={section.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Main app areas</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {appAreas.map((area) => (
              <div key={area.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-900">{area.title}</h3>
                <p className="mt-1 text-sm text-slate-700">{area.detail}</p>
                <Link href={area.href} className="mt-3 inline-flex rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  Open
                </Link>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
