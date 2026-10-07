# Scheduled writer cutover audit

Source audit: 23 September 2026. This is a migration preparation artifact, not authorization to disable a job or retire the existing app. No hosted scheduler was inspected or changed. Source registrations do not prove which jobs currently exist or run.

Seven registrations appear in legacy `20260812090000_notifications_realtime.sql` at lines 2836–2955. The eighth appears in `20260814120000_invoke_push_dispatch.sql` at lines 330–344. Paths are under `/home/drrius/Work/household-os/supabase/migrations`. Later function replacements must be included when auditing behavior; notably `20260905003000_device_push_tests.sql` replaces the outbox drain at line 217.

| Registered job                            | Entry point                                 | Audited effect and required cutover decision                                                                                                                                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `household-os-deliver-due-reminders`      | `public.run_deliver_due_reminders`          | Claims due legacy reminders and generates legacy inbox/push work. Reconcile pending items and recipients against native reminder coverage before authorizing a stop; prevent duplicate delivery during transition.                                                                                       |
| `household-os-retain-activity`            | `public.run_retain_activity_events`         | Deletes activity older than 90 days in bounded batches. Preserve the agreed retained history; decide retention explicitly rather than inheriting this job as a native default.                                                                                                                           |
| `household-os-retain-purchased-groceries` | `public.run_retain_purchased_groceries`     | Deletes purchased grocery/session-item history after 30 days. Fixture proves deletion and an owner-level function fence. Hosted job disablement and in-flight drainage remain unverified.                                                                                                                |
| `household-os-ensure-due-occurrences`     | `public.run_ensure_due_occurrences`         | Calls `private.ensure_routine_window` for active routines lacking an open current occurrence. Audit compatibility with native assignment/schedule rules and prove the replacement or retained repair path before removal. Native routine creation uses the same retained routine/occurrence tables.      |
| `household-os-deliver-member-digests`     | `public.run_deliver_member_digests`         | Builds legacy per-member digests from stored preferences and household records. Reconcile with native opt-ins and deterministic daily summaries; native settings must not inherit consent or duplicate deliveries.                                                                                       |
| `household-os-generate-recurring-drafts`  | `public.run_generate_recurring_drafts_cron` | Generates legacy drafts for due active rules and advances legacy processing through its helper. It does not grant a native mandate. Reconcile rule adoption, drafts and cursors before authorizing a stop.                                                                                               |
| `household-os-drain-push-outbox`          | `public.run_drain_push_outbox`              | Latest implementation skips unsubscribed pending rows and clears expired claims, leaving subscribed work for Edge delivery. Preserve unresolved claims and outcomes; disabling the producer does not stop an already running dispatcher.                                                                 |
| `household-os-invoke-push-dispatch`       | `private.invoke_push_dispatch`              | Uses server credentials to invoke Edge push dispatch over HTTP. Public-function revocation does not cover this private entry point or requests already sent. Inspect the actual Edge invocation and delivery backlog before a transition. Never export credentials or raw request headers into evidence. |

## Required hosted evidence

The 7 October [authorized test-project checkpoint](../../evidence/2026-10-07/hosted-test-scheduled-writers/README.md)
now verifies installed pg_cron, its readable/unfiltered extension-owned catalog,
zero registered jobs at the recorded time and all eight known entry-point
definition hashes matching current compiled migration source. Owner names differ
between local and hosted databases and are retained. This is nest-test evidence;
production, owner capabilities, private dependencies, external invokers and
drainage remain unverified. No function is invoked or scheduler changed.

The read-only `tools/migration/scheduled-writer-inventory.mjs` helper is now wired
into the disposable schema report. It records job identity, active state,
database role and schedule, with SHA-256 command and audited-function definition
hashes computed inside PostgreSQL. It never returns command or function bodies,
starts a job, pauses scheduling or opens a database connection. Its caller must
provide an authorized executor using a fresh session per SQL call; each observation
runs in a read-only repeatable-read transaction ending in rollback.

Missing extension/catalog, an unsupported catalog, insufficient privileges,
RLS-filtered visibility or more than 1,000 jobs cannot yield a complete catalog
snapshot. Unknown and inactive job names are retained. A complete catalog snapshot
still does not establish external invokers, in-flight drainage or cutover acceptance.
[Fixture verification and limits](../../evidence/2026-10-07/scheduled-writer-inventory/README.md).

The visibility check matters because [pg_cron uses row-level security](https://github.com/citusdata/pg_cron)
to limit ordinary users to their own jobs. Hashes use PostgreSQL's built-in
[SHA-256 binary function](https://www.postgresql.org/docs/16/functions-binarystring.html).
These references establish the catalog behavior, not any Nest hosted configuration.

The [legacy Edge writer source audit](legacy-edge-writer-boundaries.md) now records
attachment insertion and Web Push dispatch effects, exact source hashes and three
focused local tests. It does not establish hosted deployment identity, actual
delivery or external request drainage.

Under separately approved access, inventory every actual scheduled job, including unknown names and non-cron invokers. Record job identity, active state, database role, schedule and a digest of the command; inspect command contents securely without copying embedded credentials into progress logs. Compare the live function definitions with the audited migrations. An absent extension or suppressed migration exception is missing evidence, not proof that scheduling is disabled.

For each selected job, record the approved retain/replace/stop decision, owner, affected tables/outboxes, replacement behavior and unresolved records. Stop future scheduling only after authorization. Then establish that running transactions, claimed work and externally dispatched requests have completed or have an explicit reconciliation outcome. A job being inactive does not prove drainage. Do not delete history or mark uncertain delivery successful to clear this gate.

Reconcile financial events, ledger entries, receipt references, retained drafts and grocery/session history after the transition. Preserve newly committed events during recovery. Native `private.nest_set_recurring_execution_paused(true)` covers new native automatic expense postings after its transaction commits; it does not pause these eight jobs, stop arbitrary owner SQL, cancel HTTP requests or drain all native client commands.

## Remaining implementation and environment work

- All seven supported schedule kinds (including both after-completion units) crossed with shared/assigned/alternating policies now pass 24 full-schema synthetic repair cases, including exact window comparison and retry/no-op behavior. [Six focused history/preview cases](../../evidence/2026-10-07/routine-repair-history/README.md) now verify ordinary/leap month-end reconstruction, biweekly original anchors, after-completion days/weeks, alternating turns, unchanged closed history and retry identity. The isolated helper repairs a missing preview without altering current. The retained scheduler selects missing-current routines, so these cases do not establish scheduled preview repair. Active-window/parameter edges, transfer interactions, full-chain/hosted identity and the replacement/retention decision remain.
- The current full-schema synthetic rehearsal now verifies due reminder and recurring draft producers plus the pending push-outbox database consumer before and after pause, including a preserved live claim. [Evidence](../../evidence/2026-10-04/current-chain-pending-job-rehearsal/README.md). The7 October disposable full-schema expired-claim/retry probe now passes stale
  finalization refusal, one-time failure counting, paused preservation and disabled
  subscription skipping. [Retry evidence](../../evidence/2026-10-07/legacy-push-retry/README.md).
  Actual Edge delivery and hosted/external drainage remain open.
- Complete pending native command reconciliation and the cutover epoch decision.
- Obtain authorized hosted job/function inventory and delivery state; the local fixture lacks real `pg_cron`, `pg_net`, Edge delivery and production data.
- Exercise the approved plan on an isolated representative backend before asking for production cutover approval.

The eight names are the audited source inventory, not a complete inventory of live infrastructure. CI schedules, Edge invokers, old clients, direct SQL and other schemas still require independent accounting.

## Prepared per-job pause control

Gated migration `20260923092657_native_legacy_job_pause.sql` adds private owner-only `nest_set_legacy_job_paused(job_kind, paused)`. The seven claim kinds and `invoke_push_dispatch` have independent controls; all default to the previous running behavior. Shared gate locks last through each database invocation’s transaction, so pausing waits for that transaction and takes effect on commit. A timeout is not successful drainage. Missing controls refuse execution. No API role can change the controls.

The full synthetic fixture verifies all eight paused entry points and unchanged claims after rollback. Focused PostgreSQL tests observe the setter waiting for an open claim transaction. This is prepared recovery capability, not a live pause or complete drain: sent HTTP requests and external workers must still be reconciled. Cron registrations are not altered, and retained routine repair can be left enabled independently. Production use still needs the separate cutover approval.
