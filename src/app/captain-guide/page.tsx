import Image from "next/image";
import Link from "next/link";
import ScreenHeader from "@/components/ScreenHeader";

const sections = [
  {
    title: "1. First check after sign-in",
    bullets: [
      "Sign in using your normal league-app account.",
      "If you have been assigned as captain or vice-captain, your dashboard and notifications will reflect that automatically.",
      "If Captain Results or the relevant fixture permissions are missing, contact the League Secretary, Chairman or Treasurer rather than creating a second account.",
    ],
  },
  {
    title: "2. Competitions this app supports",
    bullets: [
      "The app supports more than the weekly league. Captains may also need to help with singles, doubles, triples, billiards, summer league, winter league, and knockout competitions.",
      "When sign-ups open, make sure players are entering the correct competition type and not duplicating accounts or entries.",
      "For doubles and triples competitions, confirm the correct teammate names before submitting the entry.",
      "Age-restricted competitions such as the Under 25s, Over 50s and Over 60s require a valid date of birth before entry can continue.",
    ],
  },
  {
    title: "3. Before the match starts",
    bullets: [
      "Open Notifications regularly. This is where lineup prompts, fixture reminders, and league messages appear.",
      "Pre-match lineups only open on the day of the fixture.",
      "The home team must submit its lineup first.",
      "Once the home team has submitted, the away captain will see an inbox prompt and can then submit the away lineup.",
      "Both lineup steps must be completed before 19:30.",
      "Use notifications as the starting point when the system is prompting you to act.",
      "If your fixture is using digital pre-match lineups, the home side enters its lineup first on the day of the fixture.",
      "The away side can then respond before the fixture start time.",
      "Once both teams have submitted, the lineup is locked and those player assignments flow into the result card.",
      "If the app cannot be used, keep an accurate manual scorecard and contact the League Secretary for the separate result-upload link. There is no paper-record option inside the digital lineup journey.",
      "The key deadline is before 19:30: if a lineup needs to be submitted in the app, it must be done before the match starts.",
    ],
  },
  {
    title: "4. During the match",
    bullets: [
      "Open Captain Results and select the relevant fixture.",
      "In the 2026/2027 Premier League, reviewed handicaps apply with a maximum playing start of 40 points. Division 1 is played off scratch.",
      "Enter the frame players carefully. Player selectors show current handicaps to help you sense-check the matchup.",
      "For a normal winter lineup, select four different singles players and any two eligible players for the doubles.",
      "With only two players, select No Show in Frame 3, acknowledge the confirmation, and the system will nominate one of the first two players for Frame 4 and place both in the doubles.",
      "With three players, select three different players in Frames 1 to 3, choose Nominated player in Frame 4, acknowledge the confirmation, and then choose any two of those three for the doubles.",
      "Enter frame points accurately and add any qualifying 30+ breaks.",
      "Use the same controlling device for score entry and break entry where possible.",
      "Each completed frame is saved as you advance. Your current work is also kept safely on the device until final submission.",
    ],
  },
  {
    title: "5. Proxy entry",
    bullets: [
      "Use agreed proxy entry only when one side cannot operate the app and both teams are content for one captain or vice-captain to handle the fixture in-app.",
      "Enable proxy entry before selecting players. It unlocks both teams' player fields on the same screen.",
      "Proxy entry does not remove the normal lineup order or final submission requirements.",
      "The acting captain or vice-captain must still make sure both teams agree the lineups and result before submission.",
      "Proxy use is recorded in the app audit trail.",
    ],
  },
  {
    title: "6. After the match finishes",
    bullets: [
      "League rule: the home team should submit the result by default unless a league officer has agreed another arrangement.",
      "Check the full card before submitting, especially player assignments, points, and breaks.",
      "After the final frame, complete the final review and press Submit match result.",
      "Submit the result when complete. The submission then moves into the league-officer review queue.",
      "Result deadline: the match result must be entered by midnight on the following day.",
      "WhatsApp results should be treated as an exception or backup route only. The normal expectation is that the result is submitted in the app so the system can update automatically after approval.",
      "Only approved results update the league table, player records, and Elo-driven handicap history.",
    ],
  },
  {
    title: "7. If something needs correcting",
    bullets: [
      "If a fixture needs moving, use the fixture date request process rather than relying only on an informal message.",
      "If you spot an error before submission, correct it immediately in Captain Results.",
      "If you spot an error after submission, contact the League Secretary, Chairman or Treasurer. They can return the result for correction or amend it during review.",
      "If a 30+ break was missed or a player could not complete a competition sign-up, tell a league officer promptly so it can be fixed cleanly.",
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
    detail: "Where captains and vice-captains handle lineups, frame-by-frame scoring, 30+ breaks, proxy entry, drafts, and final submission.",
    href: "/captain-results",
  },
  {
    title: "Competition Sign-ups",
    detail: "Use this page when summer, winter, singles, doubles, triples, or billiards competition entries are open.",
    href: "/signups",
  },
  {
    title: "Help / Handicaps",
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
            This guide assumes your account is already registered and a league officer has assigned your captain or vice-captain role. It mirrors the current captain SOP and covers both competition-entry support and match-night operation.
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
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Age-gated entries</p>
              <p className="mt-1 text-sm text-violet-900">Under 25s / Over 50s / Over 60s sign-ups require a valid date of birth before entry is allowed.</p>
            </div>
            <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-4 md:col-span-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-fuchsia-700">Handicap starts</p>
              <p className="mt-1 text-sm text-fuchsia-900">
                The 2026/2027 Premier League uses reviewed handicaps with a maximum playing start of 40 points. Division 1 frames begin level, although Elo is still recorded in the background.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-indigo-950">Match-night checklist</h2>
          <ol className="mt-3 grid gap-3 text-sm text-indigo-950 md:grid-cols-2">
            <li className="rounded-xl bg-white p-4"><strong>1. Open Captain Results.</strong><br />Select tonight&apos;s fixture and check that the teams and date are correct.</li>
            <li className="rounded-xl bg-white p-4"><strong>2. Complete the lineups.</strong><br />Home submits first; away responds after the notification. Finish before 19:30.</li>
            <li className="rounded-xl bg-white p-4"><strong>3. Switch to Scorecard.</strong><br />Once both lineups are locked, enter each frame result and any break of 30 or more.</li>
            <li className="rounded-xl bg-white p-4"><strong>4. Review before submitting.</strong><br />Check every player, score and break. The home team normally submits the completed result.</li>
            <li className="rounded-xl bg-white p-4 md:col-span-2"><strong>5. If the app causes a problem.</strong><br />Keep the match moving, retain an accurate paper scorecard and message the League Secretary. A manual upload link can be supplied when needed, but it requires manual authorisation and will update more slowly.</li>
          </ol>
        </section>

        <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Illustrated example</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">Final scorecard and submission</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                Home players appear on the left, frame scores in the centre and away players on the right. Check that every frame and qualifying break is complete before submitting.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/captain-training" className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
                Practise safely
              </Link>
              <a href="/guides/Rack-and-Frame-Captain-and-Vice-Captain-Guide-2026-27.docx" download className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100">
                Download Word guide
              </a>
            </div>
          </div>
          <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
            <figure className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <figcaption>
                <h3 className="font-bold text-slate-950">1. Normal four-player winter lineup</h3>
                <p className="mt-1 text-sm text-slate-600">Choose four different singles players and complete the doubles. Lineup actions appear after Frame 5.</p>
              </figcaption>
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <Image
                  src="/guides/screenshots/captain-winter-four-player.png"
                  alt="Winter captain lineup showing four singles, one doubles frame, and lineup actions at the end"
                  width={1173}
                  height={1283}
                  className="h-auto w-full"
                />
              </div>
            </figure>
            <figure className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
              <figcaption>
                <h3 className="font-bold text-slate-950">2. Agreed proxy entry</h3>
                <p className="mt-1 text-sm text-slate-600">Enable this at the start only with both teams&apos; agreement. It unlocks both sides so one official can enter both lineups.</p>
              </figcaption>
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <Image
                  src="/guides/screenshots/captain-proxy-entry.png"
                  alt="Agreed proxy entry active with both teams' lineup fields unlocked"
                  width={1173}
                  height={1283}
                  className="h-auto w-full"
                />
              </div>
            </figure>
            <figure className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <figcaption><h3 className="font-bold text-slate-950">3. Two-player winter lineup</h3><p className="mt-1 text-sm text-slate-600">Select No Show in Frame 3. After confirmation, Frame 4 is nominated at random and both players fill the doubles automatically.</p></figcaption>
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><Image src="/guides/screenshots/captain-winter-two-player.png" alt="Two-player winter lineup with Frame 3 No Show, named nominated player in Frame 4, and automatic doubles pairing" width={1173} height={1381} className="h-auto w-full" /></div>
            </figure>
            <figure className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <figcaption><h3 className="font-bold text-slate-950">4. Three-player winter lineup</h3><p className="mt-1 text-sm text-slate-600">Choose Nominated player in Frame 4. After confirmation, select any two players from Frames 1 to 3 for the doubles.</p></figcaption>
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><Image src="/guides/screenshots/captain-winter-three-player.png" alt="Three-player winter lineup with named nominated player in Frame 4 and doubles choices restricted to the first three players" width={1173} height={1381} className="h-auto w-full" /></div>
            </figure>
            <figure className="rounded-2xl border border-sky-200 bg-sky-50 p-4 lg:col-span-2">
              <figcaption><h3 className="font-bold text-slate-950">5. Review and submit the completed scorecard</h3><p className="mt-1 text-sm text-slate-600">Check every player, frame score and qualifying break with both teams before final submission.</p></figcaption>
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><Image src="/guides/screenshots/captain-final-scorecard-complete.png" alt="Completed captain scorecard with players, frame scores, a recorded break and submission confirmation" width={1265} height={710} className="h-auto w-full" /></div>
            </figure>
          </div>
          <p className="mt-3 text-sm text-slate-600">Training names and scores are examples only. The practice screen does not save anything to live league records.</p>
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
