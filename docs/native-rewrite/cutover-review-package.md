# Nest cutover review package

Updated 7 October 2026; originally prepared 4 October. This is the review plan for a future separately approved production transition. It is not an executable activation script, approval to change production, or a claim that release gates pass. The existing Household OS app remains in service.

## Current evidence

| Area               | Proven                                                                                                                            | Still needed                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Migration chain    | Disposable populated54-legacy/257-Nest run, hashes recorded, exact retained financial reconciliation                              | Representative isolated hosted run with actual Auth/Storage interfaces and supported extensions           |
| Financial recovery | 24 newly committed fixture events survive freeze; balances/history/details and private operation/approval reads remain correct    | Real old-device intent inventory and complete pending-command reconciliation                              |
| Old database jobs  | Eight owner-only pause guards, lock-wait checks and pending reminder/draft/outbox preservation                                    | Actual job/function inventory, retain/replace/stop decisions and running-job drainage                     |
| Offline transition | Fixture epoch activation fences old new commands while keeping known recorded receipts recoverable                                | Agree and record the real epoch; reconcile both phones' unknown saved work before switching               |
| External writers   | Audited cron source inventory plus separate Edge push-dispatch consumer                                                           | Live Edge, GitHub/Vercel schedules, old clients, direct SQL and already dispatched requests               |
| Client             | Build22 is internally available with exact-source CI, local signing/package checks and retained native journey evidence           | Current final signed binary on both phones, Quiet/accessibility and full agreed journey acceptance        |
| Integrations       | Test API and bounded authorized/isolation checks pass                                                                             | Live AI eligibility, worker credential configuration, APNs provider and real deliveries                   |
| Test security      | Fresh hosted public RLS, private-schema API rejection, worker client-denial grants, zero database cron jobs and advisor inventory | Privileged-function semantic review, signup/provider decisions, external writers and production inventory |

The [current rehearsal](../../evidence/2026-10-04/current-chain-pending-job-rehearsal/README.md), [migration limits](migration-rehearsal.md), [scheduled writer audit](scheduled-writer-audit.md), [remaining checklist](remaining-work.md) and [phone checklist](swiftui-phone-acceptance.md) contain the supporting records. The local rehearsal's `complete:true` describes its diagnostic; it explicitly reports simulated Auth/Storage, excluded pg_net, unverified external drainage and incomplete recovery.

The [hosted test inventory](../../evidence/2026-10-04/test-environment-security-inventory/README.md) now adds actual test-project advisor, Auth/provider, schema-exposure, migration/Edge and worker privilege observations. It does not close the rehearsal's Auth/Storage simulation gaps or establish production safety. The81 public privileged-function warnings require semantic review, and live non-cron writers still need inspection; no test warning has been cleared by weakening access.

## Approval packet to assemble

Before proposing a transition, freeze the exact client/backend/migration source versions and record the final IPA hash, environment identifiers, required CI results, both-phone acceptance and the aggregate monthly cost. Identify one operator and prevent concurrent schema deployments and control changes for the transition window.

Record the authorized source/target schema and migration hashes, an encrypted supported backup location, complete financial-row and receipt relationship reconciliation, private stored-file byte/access checks and the cutover epoch. Evidence shared in this repository must contain counts/digests and sanitized outcomes rather than personal exports, passwords, provider keys or embedded job credentials.

Inventory every live writer, including unknown jobs and non-cron invokers. For each, name its retain/replace/stop decision, affected rows/outboxes, responsible operator and replacement behavior. An inactive job is insufficient: account for running transactions, valid claims and external requests already sent. A fixture pause cannot establish that hosted scheduling or Edge dispatch has stopped.

Inventory pending work from both old and new clients and the server: chore/grocery commands, meal/proposal/ingredient changes, personal/household preferences, AI turns and command results, financial saves and approvals, recurring cycles and receipt uploads. Classify each exact operation as recorded, definitively cancelled/refused, safely replayable or unresolved. Preserve unresolved identifiers and require an explicit reconciliation outcome; do not discard journals, fabricate delivery or reissue a financial command with a fresh ID.

The packet is ready for owner approval only when these records and all first-release gates are complete. TestFlight availability, source merging, schema deployment, writer control activation, production migration and retirement are distinct decisions.

## Proposed controlled transition

1. Rehearse the exact approved plan on an isolated representative backend. Compare all retained relationships, centimes, balances, files and pending-operation outcomes before and after. Prove the recovery procedure preserves events posted during the transition.
2. Obtain approval for the concrete production plan, environment, maintenance window and the identified operator's actions. Keep normal production operation until that approval.
3. Account for external invokers and sent requests first. Apply only reviewed schema changes and writer controls from the approved packet. Pause selected legacy jobs and native automatic financial posting in the audited order. Do not assume SQL grant revocation controls owner jobs or outside services.
4. Verify exact guarded-table coverage and commit the approved write barrier, API fence and epoch transition in the prescribed transaction. A timeout, deadlock, missing guard, unaccounted writer or changed source hash aborts the transition; it must not be reported as successful drainage.
5. Reconcile again, retaining the latest financial history. Prove authorized reads and private receipt recovery, refuse old unrecorded commands and verify the new client against the approved environment. Resume only the selected replacement writers after reconciliation, consent and provider gates pass.
6. Observe both members' real workflows and notifications. Keep the old application and recovery capability until explicit retirement approval and the agreed acceptance period.

## Recovery rules

On failure, stop new mutations through the reviewed controls and preserve the latest database. Keep authorized history/detail and operation-status reads available. Determine what actually committed from scoped receipts and immutable history; use exact identities for allowed recovery. Do not restore an earlier database over new financial events, delete newly recorded entries, or infer success from an absent response.

Resuming a barrier does not restore revoked grants or restart jobs. The packet must record the exact intended grants, pause states and epoch policy and rehearse restoration explicitly. If a deployment/schema change itself needs reversal, prefer a reviewed forward repair preserving committed history; any restore/data repair needs a separate concrete decision. Never silently re-enable old writers, automatic mandates, partner permissions or notification consent.

## Exact open inputs

Production has not been inspected or changed for this package. It still needs separately authorized live inventory/representative data handling, both clients' pending-intent outcomes, stored bytes/access and a final owner-approved transition window. AI eligibility and the already pending specific test-worker secret-transfer approval, APNs provider setup, both-phone acceptance and passing final-source checks remain prerequisites. No production activation is currently scheduled.

The 7 October chain checkpoint is recorded in
[the private privilege inventory](../../evidence/2026-10-07/private-function-inventory/README.md).
It covers 60 public definers, two invokers and catalog parity for 219 private
privilege signatures. Catalog parity does not prove private-function semantics,
direct table/Storage policy completeness or live writer drainage. Those gates
remain open, and no production authorization is inferred.
