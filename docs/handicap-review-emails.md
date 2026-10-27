# Automatic handicap review emails

Implemented for completed scheduled Premier League reviews. **Delivery is disabled by default. No email has been sent or deployment performed as part of implementation.**

The migration snapshots the review, roster, changes and rating evidence in the same transaction as the existing review routine. The worker creates one player message per changed player and one summary per captain of an affected team. Unchanged players get no individual email. No email addresses appear in team summaries. Current ownership, confirmed account email, account bans, archived players, captain membership, team membership and current handicaps are checked before delivery. Changed or invalid recipients and stale handicaps are skipped.

## Approval and rollout

1. Review `deliverables/Handicap-Player-Email-Example.html` and `deliverables/Handicap-Captain-Email-Example.html`. Examples use fictional names, dates and results.
2. Apply `supabase/migrations/20261027_handicap_review_emails.sql` to staging and exercise the existing scheduled-review RPC with a complete due week. Confirm a single snapshot and matching history are created. This integration check requires PostgreSQL and has not been run locally.
3. Deploy the application and migration with sending disabled. Confirm `RESEND_API_KEY`, verified `EMAIL_FROM`, `CRON_SECRET` and public HTTPS `NEXT_PUBLIC_SITE_URL` are configured. The ten-minute Vercel schedule requires a plan supporting that frequency.
4. Only after the user approves the examples, set `HANDICAP_REVIEW_EMAILS_FROM` to an explicit UTC activation timestamp and `HANDICAP_REVIEW_EMAILS_ENABLED=true`. Reviews completed before that timestamp are excluded. Do not use a historical date without reviewing the affected batches.

League managers can GET `/api/league/handicap-email-preview` with their bearer token for fictional previews, or add `?reviewId=<review UUID>` for the immutable captured review. The endpoint is read-only and never sends or queues messages. It returns subject, text and HTML for player and captain previews.

## Delivery and operations

`/api/cron/handicap-review-emails` requires the cron secret and checks both activation settings before any database or email access. SQL tables use RLS with service-role access only. A unique outbox key and row lease prevent duplicate jobs. Resend receives a stable idempotency key; recipient and content are held stable across retries. A failed attempt is retried after five minutes. An unconfirmed attempt older than 23 hours moves to `attention`, rather than risking a duplicate after the provider's deduplication window. Reconcile these rows against Resend before any manual retry. Monitor `attention`, repeated errors and `skipped` rows in `handicap_email_outbox`.

Turning the enable flag off stops all processing. It does not delete queued messages. Check pending rows before re-enabling. The migration does not backfill past reviews. Future snapshot comparisons distinguish new and rebuilt result records. For the first captured review, the email explicitly says that the earlier Elo snapshot is unavailable and the recorded activity may include rebuilt historical results. A recorded timestamp is labelled as such where no fixture date is available. No date is invented when the next review's fixtures are not scheduled.

Current scope is the automatic scheduled review. Separate officer handicap edits and corrective realignments outside that review are not individually notified. Pending messages are suppressed if the published handicap has since changed. Adding independent correction notifications should use a separate change identifier and reason, rather than replaying a completed review.

Validation: `node --test tests/handicap-review-emails.cjs`, targeted ESLint, and `npx tsc --noEmit --incremental false`. Generate the two preview files with `node tests/handicap-review-emails.cjs --preview` (no network or email calls).
