# Current schema and pending legacy job shutdown rehearsal

Verified4 October2026 using a fresh disposable PostgreSQL cluster. The runner accepts a local audited migration directory, never a database URL. It applied54 legacy and all248 current Nest migrations. The one excluded pg_net extension declaration is checked byte-for-byte against the expected trimmed statement; its source/hash and all simulated Auth/Storage interfaces are explicit in `rehearsal.json`. This is partial infrastructure verification, not hosted migration acceptance.

## New shutdown proof

The full schema now also runs `verifyPendingLegacyJobs`. Within rollback-only transactions it seeds one due reminder, one unclaimed pending notification and one live claimed notification with two previous attempts. Existing fictional recurring rules/drafts provide a due rule.

The active baseline invokes the real retained reminder producer, recurring draft producer and push-outbox database consumer. It proves actual reminder delivery into the database inbox, creation of a later recurring draft, unclaimed notification skip without a subscription, and preservation of the exact live claim. No HTTP dispatcher, actual push provider or model is invoked.

The paused variant exercises those same three real entry points and requires their precise pause refusal. It compares every field of all pending reminders, inbox/outbox rows, claims, recurring rules/drafts and digest preferences; no row is removed, delivery invented, attempt reset or recurring cursor advanced. Each transaction rolls back and the complete original snapshot plus financial/receipt reconciliation must match afterward.

## Existing checks rerun on the current chain

The whole runner also rechecks seven retained financial events, eight allocations, fourteen ledger entries and one receipt reference, groceries/session history, recipes/planned meals, routines/completions, privacy defaults, excluded modules and renewal provenance. Twenty-four schedule/assignment repair combinations and all eight owner-only job pauses pass. Its final committed recovery adds24 new financial events, commits the cutover epoch and freezes writes without restoring an old database. New history, balances/details, owner-only receipts and private pending/denied/consumed approvals remain readable; outsider/private-access refusals and old-command epoch behavior pass.

`rehearsal.json` has `complete:true`, no error and302 applied migrations. Completion describes this diagnostic only. It explicitly retains `schedulingVerified:false`, `storageBytesVerified:false`, `externalRequestsDrained:false`, `ownerJobsStopped:false`, `completeRecovery:false`. Security advisors were not run because no binary was configured. Source formatting/scoped lint pass with two pre-existing Effect node-built-in advisory warnings in the runner. Required routine CI37169476872 now passes at exact source `0c08d0cc`; see `ci-routine.json`. Local full-schema execution is the behavioral evidence.

## External writers and remaining limits

The audited reference has an independently callable Edge `push-dispatch` consumer, which uses `claim_push_outbox` and delivery-result mutations. Pausing the database cron invoker does not prove this consumer or already dispatched browser-push requests have drained. The examined CI/Claude workflow files contain no cron schedule; that source observation cannot prove deployed GitHub/Vercel/Supabase schedules or unknown invokers absent. `provenance.json` records the reference checkout and reviewed file hashes.

A real hosted job/function inventory, live claims/external requests, all old-device pending intents, Auth/Storage bytes/access, security advisors, broader repair edges, representative isolated-host rehearsal and owner-approved production cutover remain open. Neither the test Supabase project nor production was read or changed for this rehearsal.
