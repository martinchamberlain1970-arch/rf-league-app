# Officer scorecard entry

League managers use League Manager → Fixtures → the fixture's result-entry button. The officer form holds scores and lineup changes in memory; leaving a score box does not save or validate the card. Enter the complete lineup, scores and breaks, then choose **Validate and save result**. Errors are listed together above the card. A successful save processes Elo and any due handicap review once.

Captain entry and submission routes are unchanged. The new endpoint requires league-management access, and its database function is callable only by the service role. Scores and breaks are saved in one PostgreSQL transaction after validation. Original frame values and break entries are compared before saving, so a stale draft is rejected. Ratings processing follows the transaction; if it fails, the response distinguishes a saved scorecard from incomplete processing.

Drafts are in-memory only. Closing the result modal keeps the current draft; reloading or leaving the page can lose it. The browser warns on page unload. Save the current card before switching fixtures, especially when entering breaks.

## Release order

1. Apply `supabase/migrations/20261030_officer_scorecard.sql` to the target database.
2. Set `NEXT_PUBLIC_OFFICER_SCORECARD_ENABLED=true` in staging, rebuild/deploy, and verify using an officer account.
3. After the production database migration is applied, set the same variable in production and redeploy.
4. Check a captain account still uses the existing entry flow.

The rollout switch defaults to disabled. Code may be deployed safely before the migration: the existing officer flow remains active and the new API returns 503. Enable only after the migration is installed. The live database has not been changed by this commit.

## Checks

- `node --test tests/officer-scorecard.cjs`: validation, no writes for invalid cards, officer-only endpoint, one save and one rating-processing call.
- `PGLITE_MODULE=/path/to/pglite/dist/index.js node tests/officer-scorecard-postgres.mjs`: atomic save, stale-card rejection, stale-break rejection, rollback on failure and role permissions in isolated PostgreSQL.
- TypeScript and production build; targeted ESLint (existing warnings in the large league page).

## Deployment verification — 30 October 2026

The production database function was installed through the authenticated Supabase SQL editor. Permission checks returned `service_allowed=true`, `member_allowed=false`. The rollout variable was set to `true` for Preview only; Production remains disabled pending staging checks.

Production was subsequently enabled and redeployed after the signed-in staging check passed. The live officer form and authenticated endpoint were verified; no real result was submitted during testing.
