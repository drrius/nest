# Nest progress

Updated 7 October 2026. The goal remains active and incomplete. SwiftUI is the
shipping iPhone client under [ADR 0002](adr/0002-swiftui-client.md). Expo and React
Native are removed. The agreed product scope, Effect backend, financial history
and privacy rules remain authoritative.

## Current build

**SwiftUI 0.1.0, build 22 is available for internal TestFlight testing.** Its frozen
source is `f324c905ce0c2129b732b37663f03c4ea4392350`. Apple reports VALID,
IN_BETA_TESTING and unexpired. The single submission finished; no further upload
is needed. [Build and availability evidence](../evidence/2026-10-07/swiftui-build22/README.md).

It uses the separate test Supabase/API and keeps push disabled. It includes the
shared tab layout, financial review fixes, saved variable-bill recovery and Today
button styling. Installation of this version, partner tester access and full
phone acceptance remain unverified. Use the [short phone pass](native-rewrite/build21-first-phone-pass.md)
and [full acceptance checklist](native-rewrite/swiftui-phone-acceptance.md). The short
checklist's historical filename is retained; its contents identify build 22.

Source work runs on Linux at `/home/drrius/Work/nest`; signed Xcode builds and
simulator journeys run on the authorized Mac. The original clients, credentials,
local journals and settings are preserved. New source remains on
`codex/swiftui-renewal-navigation`; no production cutover or public release occurs.

## Milestone checklist

Unchecked means full acceptance remains open. Implementation and bounded tests
are credited without claiming live-provider or physical-device verification.
The [remaining acceptance list](native-rewrite/remaining-work.md) links detailed
journey evidence and identifies the uncovered requirements.

- [x] **M0, decisions and native execution.** ADRs, action inventory, signed execution, source/build identity and scoped four-tab smoke pass. [Foundation audit](../evidence/2026-10-04/swiftui-m0-foundation/README.md).
- [ ] **M1, Quiet UI.** Shared tab headers/insets and real screens exist. Selected light/dark and Dynamic Type journeys pass. Contrast reports, populated/error/keyboard usability, VoiceOver, Reduce Motion and owner acceptance remain open.
- [ ] **M2, authenticated offline and AI slice.** Keychain, scoped SQLite, authorization, operation receipts and tested recovery exist. Successful live streaming/tools/approval and phone offline acceptance remain open.
- [ ] **M3, identity and setup.** Apple sign-in, independent onboarding, editable preferences and private memory exist with account/privacy tests. Both-phone sign-in, interruption/recovery and complete setup acceptance remain open.
- [ ] **M4, Today, chores and groceries.** Commands and AI tools exist. Two simulator clients demonstrate retries, restarts, conflicts and schedule/skip/archive races. Hardware radio loss, haptics, remaining access-revocation variants and uncoached daily use remain open.
- [ ] **M5, Meals.** Manual week, recipes, placement/move/leftovers, ingredients, preparation and portion persistence have bounded native evidence. Live generation/replacement/approval, varied estimates and the full partner phone journey remain open.
- [ ] **M6, Calendar.** EventKit, selection, layers and opt-in busy-only sharing exist. Bounded timed/all-day/DST/privacy checks pass. Real calendars on both phones, revocation, background/stale/offline behavior and full privacy acceptance remain open.
- [ ] **M7, Money.** Append-only ledger invariants, financial approvals, full/partial native posting, receipts and selected lost-reply/cancellation recovery pass. Remaining races/AI handoffs, scheduled-cycle acceptance and both-phone financial journeys remain open.
- [ ] **M8, reminders and push.** Renewals, preferences, enrollment/outbox/worker source and focused tests exist. APNs credentials, authorized worker configuration and actual six-kind delivery on both phones remain open.
- [ ] **M9, migration and release.** Disposable schema/domain reconciliation and rollback/retry rehearsals pass. Trusted writers, pending intents, authorized existing-data rehearsal, complete UX acceptance and final release/cutover gates remain open.

## Verification

Build 22's exact source passes routine CI
[37612410978](https://github.com/drrius/nest/actions/runs/37612410978) and native CI
[37612410354](https://github.com/drrius/nest/actions/runs/37612410354). Local signed
archive/export, package configuration and all 1,176 frozen inputs match. Native CI
reports zero failures with guarded/device-dependent skips; those skips and UI
compilation do not establish phone or live-provider execution.

Hosted test-backend journeys include two-client chore/grocery recovery, manual
meal planning, append-only financial posting and PDF access. Later variable-bill
lost Save and cancellation replies recover with preserved request identities;
managed Storage rejects an expired receipt URL while a fresh authorized URL
returns the same bytes. Their evidence and limits are linked in the remaining list.
Production data was not used for those writes.

The new read-only scheduled-writer inventory is integrated into the disposable
migration runner and focused CI selection. Thirteen local PostgreSQL checks pass
with no failures or skips across the new inventory and existing privilege/fence
checks. They cover missing/restricted/unsupported/truncated catalogs, unknown and
inactive jobs, hashed commands/functions without exported bodies, unchanged rows
and refusal of an already writable transaction.
[Evidence](../evidence/2026-10-07/scheduled-writer-inventory/README.md).
Real pg_cron execution, hosted identity and drainage remain unverified.
This change does not require another phone build. Source `e724fe87` passes routine
[CI 37615820449](https://github.com/drrius/nest/actions/runs/37615820449).

CI now has a conservative documentation-only path. It retains
formatting, relative-document link checks and its own scope tests. Application
checks can be omitted only for docs/evidence Markdown changes whose base commit
already passed CI; unknown/failed/pending bases and all other changed files keep
the full checks. Four local Git/CLI cases and full source
[CI 37616655593](https://github.com/drrius/nest/actions/runs/37616655593) pass at
`7911bb76`. An actual documentation-only push is the remaining execution check.

## Exact blockers and owner inputs

- **Live AI:** the last provider result was `customer_verification_required` with zero credits; this is historical, not current eligibility. Automatic approval review blocked generating a short-lived `nest-test-api` OIDC token for a read-only credits check. The specific approval question remains pending. No token, model call, purchase or billing change followed.
- **Scheduled workers:** automatic approval review blocked transferring the test Supabase server key and scheduler token to Vercel. The specific transfer approval remains pending; no alternate transfer or worker activation occurred.
- **APNs:** server-side provider `.p8`, key ID, team/configuration and physical token/delivery verification are missing. App Store signing credentials do not supply that provider key. Push stays disabled.
- **Phones:** both partners need build 22 installation and acceptance of ordinary daily, weekly, financial and Calendar tasks. VoiceOver, Reduce Motion, real radio interruptions and push require hardware evidence. Partner tester access remains unverified; existing feedback requests should not be duplicated.
- **Merge:** [PR 85](https://github.com/drrius/nest/pull/85) is OPEN at `1c00a089`, with four successful checks. Its sole Greptile response reports the trial credit limit and supplies no approval. The specific automatic-review merge rejection remains unresolved. The owner waived extra Sol review; no Sol, duplicate unchanged review request or alternate main push is used.
- **Production:** existing-data reconciliation, writer decisions and pending-intent/external-work drainage must precede cutover. Production migration, retirement and public release remain separately gated. Fixture success is not authorization.

## Work order

Keep build 22 stable for phone testing. Batch necessary shipping fixes, preserve
completed evidence and repeat checks only for affected changes, failures or uncovered
requirements. Finish concrete local gaps while provider/worker/device blockers
remain. Reconcile all milestone exits before declaring completion.

The owner removed the continuation automation; it remains removed. No extra Sol
verification is required. Purchases and new tester invitations are not implied.

## History

[7 October checkpoints](progress-history-2026-10-07-checkpoints.md) preserve the former
full log, including intermediate builds, unsuccessful attempts and source-specific
counts. [7 October preparation history](progress-history-2026-10-07.md),
[5 October history](progress-history-2026-10-05.md) and
[1 October history](progress-history-2026-10-01.md) retain earlier evidence.
Historical pending statements do not override the current remaining list.
