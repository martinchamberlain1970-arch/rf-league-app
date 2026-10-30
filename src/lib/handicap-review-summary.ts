export type CompletedHandicapReview = {
  week_no: number; completed_at: string; changed_player_count: number;
};
export type HandicapReviewSummary = {
  reportWeek: number;
  reportReview: CompletedHandicapReview | null;
  reportReviewDue: boolean;
  latestReview: CompletedHandicapReview | null;
  nextReview: { week: number; date: string | null; outstanding: number } | null;
  unavailable?: boolean;
};
export function buildHandicapReviewSummary(
  reportWeek: number,
  fixtures: Array<{week_no: number | null; fixture_date: string | null; status: string}>,
  reviews: CompletedHandicapReview[],
): HandicapReviewSummary {
  const due = (week: number) => week >= 1 && (week <= 4 || week % 4 === 0);
  const ordered = [...reviews].sort((a,b) => b.week_no-a.week_no);
  const latestReview = ordered[0] ?? null;
  const nextWeek = [...new Set(fixtures.map(f=>f.week_no).filter((w): w is number => w !== null && due(w) && w > (latestReview?.week_no ?? 0)))].sort((a,b)=>a-b)[0];
  const nextFixtures = fixtures.filter(f=>f.week_no===nextWeek);
  return {
    reportWeek, reportReview: reviews.find(r=>r.week_no===reportWeek) ?? null,
    reportReviewDue: due(reportWeek), latestReview,
    nextReview: nextWeek === undefined ? null : {
      week: nextWeek,
      date: nextFixtures.map(f=>f.fixture_date).filter((d): d is string=>Boolean(d)).sort().at(-1) ?? null,
      outstanding: nextFixtures.filter(f=>f.status!=="complete").length,
    },
  };
}
