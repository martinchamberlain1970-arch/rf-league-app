import type { HandicapReviewSummary as ReviewSummary } from "@/lib/handicap-review-summary";

function dateLabel(value: string, includeTime = false) {
  return new Date(value.length === 10 ? `${value}T12:00:00Z` : value).toLocaleString("en-GB", {
    timeZone: "Europe/London", day: "numeric", month: "long", year: "numeric",
    ...(includeTime ? { hour: "2-digit" as const, minute: "2-digit" as const } : {}),
  });
}
export default function HandicapReviewSummary({ summary }: { summary?: ReviewSummary | null }) {
  if (!summary) return null;
  if (summary.unavailable) return <section className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-amber-100">Handicap review status is temporarily unavailable. Elo changes alone do not confirm that a handicap review has completed.</section>;
  const completed = summary.reportReview;
  return <section aria-label="Handicap review status" className="rounded-2xl border border-emerald-300/30 bg-emerald-400/10 p-5 text-white">
    <p className="text-xs font-bold uppercase tracking-widest text-emerald-200">Playing handicap review</p>
    <h2 className="mt-2 text-xl font-bold">{completed ? `Week ${summary.reportWeek} review completed` : summary.reportReviewDue ? `Week ${summary.reportWeek} review awaiting completion` : `Week ${summary.reportWeek}: Elo update only`}</h2>
    <p className="mt-2 text-sm text-slate-200">{completed
      ? `${dateLabel(completed.completed_at, true)} UK time · ${completed.changed_player_count} player${completed.changed_player_count === 1 ? "’s" : "s’"} handicaps changed.`
      : summary.reportReviewDue ? "No completed handicap review is recorded for this week yet. Weekly Elo movements do not themselves confirm a change to playing handicaps." : "This is not a scheduled handicap review week. Elo updates after rated frames; playing handicaps change at a scheduled review or an authorised adjustment."}</p>
    {!completed && summary.latestReview ? <p className="mt-2 text-sm text-slate-200">Latest completed review: Week {summary.latestReview.week_no}, {dateLabel(summary.latestReview.completed_at)}.</p> : null}
    <div className="mt-4 border-t border-emerald-200/20 pt-3">
      <p className="font-semibold">{summary.nextReview ? `Next review: Week ${summary.nextReview.week}${summary.nextReview.date ? ` — ${dateLabel(summary.nextReview.date)}` : " — date to be confirmed"}` : "Next review date to be confirmed"}</p>
      <p className="mt-1 text-sm text-slate-300">Runs automatically once all fixtures in that review week are marked complete.{summary.nextReview?.outstanding === 0 ? " All results are complete; review confirmation is pending." : " Delayed results can delay the review."}</p>
    </div>
  </section>;
}
