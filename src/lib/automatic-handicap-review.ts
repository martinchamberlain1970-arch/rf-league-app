import type { SupabaseClient } from "@supabase/supabase-js";

export type AutomaticHandicapReviewResult = {
  applied: boolean;
  reason?: string;
  weekNo?: number;
  reviewed?: number;
  changed?: number;
};

export async function applyDuePremierHandicapReview(
  adminClient: SupabaseClient,
  fixtureId: string,
): Promise<AutomaticHandicapReviewResult> {
  const result = await adminClient.rpc("apply_due_premier_handicap_review", { p_fixture_id: fixtureId });
  if (result.error) {
    if (/schema cache|does not exist|could not find the function/i.test(result.error.message)) {
      return { applied: false, reason: "automation_not_enabled" };
    }
    throw new Error(result.error.message);
  }
  return (result.data ?? { applied: false, reason: "no_result" }) as AutomaticHandicapReviewResult;
}
