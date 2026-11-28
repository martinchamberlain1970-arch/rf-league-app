import { expectedLeagueScorecardFrames } from "./league-scorecard-validation";

export const allFramesSavedLabel = "All frames saved · Result still to submit";
export const submittedForApprovalLabel = "Submitted for approval";

type Frame = {
  slot_no: number;
  slot_type: "singles" | "doubles";
  winner_side: "home" | "away" | null;
  home_forfeit: boolean | null;
  away_forfeit: boolean | null;
};

export function liveMatchStatus(input: {
  approved: boolean;
  submitted: boolean;
  frames: Frame[];
  singles: number;
  doubles: number;
  hasSavedScore: boolean;
  lineupsSubmitted: boolean;
}) {
  const expected = expectedLeagueScorecardFrames(input.singles, input.doubles);
  const allRecorded = expected.length > 0 && expected.every((slot) =>
    input.frames.some((frame) => frame.slot_no === slot.slot_no && frame.slot_type === slot.slot_type &&
      (frame.winner_side || frame.home_forfeit || frame.away_forfeit))
  );
  if (input.approved) return { matchState: "match_ended", statusLabel: "Match Ended — approved" } as const;
  if (input.submitted) return { matchState: "awaiting_approval", statusLabel: submittedForApprovalLabel } as const;
  if (allRecorded) return { matchState: "awaiting_submission", statusLabel: allFramesSavedLabel } as const;
  if (input.hasSavedScore) return { matchState: "in_progress", statusLabel: "In progress" } as const;
  if (input.lineupsSubmitted) return { matchState: "awaiting_scores", statusLabel: "Awaiting scores" } as const;
  return { matchState: "awaiting_lineup", statusLabel: "Awaiting line-up" } as const;
}
