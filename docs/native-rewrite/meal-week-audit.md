# Manual meal weeks: source audit and implementation boundary

20 September 2026. Reference commit: `household-os` `4a528c96caf41515a70291ccecbba9d7b35e3349`. No production records were read. The approved Nest brief is authoritative.

## Audited source

`supabase/migrations/20260811180000_meals_groceries.sql` defines the existing meal definitions, grocery templates and planned entries. Planned entries retain their UUID, household, date, optional slot, definition reference, title/link snapshots, notes, leftover source, grocery-materialization marker and removal history. Composite foreign keys bind definition and leftover references to the household. A partial unique index permits one active entry per household/date/non-null slot. Null slots represent Monday ideas; Nest does not delete or silently place those historical records.

The same migration's `public.place_meal` invokes `private.materialize_meal_groceries` for a slotted library meal. Reusing this RPC would add groceries before the separate review required by Nest. Its household-wide legacy receipt identity also does not establish the new actor-bound command contract. The legacy function is not imported or exposed to the native client or assistant.

The leftover trigger rejects missing/removed sources, nested leftovers and sources on the same or a later day. It validates the row being inserted or moved; by itself it does not protect dependents when the source later moves or is removed. Native write transactions must explicitly validate that relationship and test races. Merely reusing that trigger would be insufficient evidence.

Legacy entry/definition `updated_at` uses transaction `now()`. It is not a monotonic edit generation: multiple updates in one transaction can share a timestamp. Native week concurrency therefore must not infer an untouched week from these timestamps or a list of currently occupied slots; empty-slot races and remove/reinsert changes also matter.

The first read-contract slice audited only these source sections and copied no legacy SQL or UI. Date helpers reuse Nest's already audited pure civil-date rules. The storage-fixture audit below extends that review; recipe-edit/template lifecycle commands still need targeted audit before reuse.

## Read contract now implemented

A snapshot is one explicit Monday–Sunday week, household UUID, decimal-string bigint revision and at most 21 active slotted entries. Validation rejects duplicate entry IDs, duplicate date/slot pairs, dates outside the requested week and self-referencing leftovers. Cross-week leftover references are retained, not guessed invalid because the source is outside this snapshot. Configured visible slots affect presentation only; reads must retain all three slot types so hidden meals cannot be overwritten unknowingly.

Stored title validation follows PostgreSQL's ASCII-space trim and Unicode code-point limit, including existing padded titles. Notes and recipe links retain their existing code-point limits and are not normalized. A stored link is data, not permission to open an arbitrary URL scheme; the eventual native opener must independently permit HTTP(S) only. New edit forms may impose narrower input limits without rewriting untouched history.

The pure week helper uses civil dates and UTC arithmetic. It returns all seven days regardless of timezone/DST and rejects partial weeks beyond the supported years 0001–9999. The last complete Monday is 9999-12-20. Adjacent navigation rejects crossing that range instead of wrapping.

## Storage and fixture audit

The gated `20260920161318_native_meal_week_snapshots.sql` now implements per-household/week revisions without backfilling or rewriting existing meals. An absent counter means revision zero. A trigger increments the affected old/new weeks for every entry insert/update/delete within the native complete-week range, including legacy writers and unslotted ideas. Each old/new side outside years 0001–9999 or the last complete week is skipped independently, preserving legacy infinity/BC/out-of-range writes; moving into or out of the supported range still advances the supported side. It uses deterministic ordering and transactional upserts. An overflowing counter fails and rolls back the meal edit; household cascade cannot recreate counters for a deleted household. Clients have tenant-scoped SELECT only; the private definer is trigger-only and cannot be directly invoked.

The snapshot RPC is authenticated, STABLE, security invoker and RLS-backed. Revision and entries use the same statement snapshot. It returns all active slotted meals in date/breakfast/lunch/dinner order, regardless of visibility preferences; legacy ideas and removed entries remain stored. Strict canonical Monday/date bounds and an overflow probe prevent partial or silently truncated weeks.

`tests/database/legacy-meals/` deliberately copies only the initial migration's category/meal tables, indexes, timestamp trigger and leftover trigger declaration. `read-policy.sql` reproduces the original select RLS and privilege statements. The latest pinned `20260905072131_serialize_leftover_source_dates.sql` is copied as `leftovers.sql` (only trailing blank-line cleanup): it adds a shared lock on the source and validates active child dates/source kind. This supersedes the initial trigger's date-race gap; the original trigger still does not fire on removal-only updates. No legacy placement/materialization/move/removal command is used in this fixture. The fixture omits unrelated shopping/ledger infrastructure and does not claim full migration-chain coverage.

Nine disposable PostgreSQL cases verify tenant/revocation/privilege boundaries, untouched legacy data, same-transaction timestamp ABA, moves across weeks, ideas/removal/rollback, concurrent increments, a controlled read/write snapshot race, full 21-slot boards, malformed/boundary weeks, exact bigint overflow rollback household cascades and legacy unsupported-date transitions. All regular snapshots decode through the shared Effect contract. Isolated Supabase security advisors report no issues. No API/native action is exposed by this migration.

## Next transaction work — still unimplemented

- Authorized snapshot reads are now wired through API, the account-leased native cache/board and the private assistant tool. Device verification and production migration remain gated.
- Native manual writes bind a stable actor/household/operation identity, exact payload and expected week revision. Check explicit occupied-slot identity before replacement. Cross-week moves lock and validate both weeks; stale forms must conflict rather than silently overwrite.
- Preserve entry IDs, history, recipe snapshots and grocery provenance. Do not clear materialization markers or post groceries/money as a side effect. Define and test dependent-leftover behavior before enabling moves/removal.
- Add shared authorized services, native seven-day board/forms, corresponding private AI tools and lost-response/concurrent-partner integration tests. Manual actions remain online-only; loaded snapshots may be viewed offline.
- Saved recipe detail, generated proposals with exact visible revision approval, and separate idempotent ingredient review remain subsequent M5 slices. The read contract does not implement any of these actions.

All additive database changes remain gated from production deployment. This document does not authorize migration or cutover.

## One-off placement storage candidate

`20260920170119_native_meal_placement.sql` adds only explicitly named one-off meals into empty slots. It does not call the legacy placement/materialization command. The strict shared command includes the requested date/slot/title, complete week, expected decimal revision and operation UUID. SQL validates all types/keys, civil-date bounds and the new UTF-16 title limit; stored historical titles remain untouched.

Current membership is locked before the actor-private receipt lookup. Identical retries return the original receipt after later edits/removal; changed payloads are rejected. A zero counter row now represents and locks an untouched week without altering its logical revision. Writers lock that row and compare the expected revision before checking the slot and inserting the entry. The existing trigger advances the revision in the same transaction. Raw legacy writers participate through that trigger; their earlier commit invalidates a native baseline, and later commits advance the same counter. Slot collisions, deadlocks and lock timeouts become explicit conflicts. Receipt failure rolls back the entire placement.

The private definer is required because clients have no direct meal/counter/receipt write privileges. It authorizes every call, pins an empty search path and revokes public/anonymous/service-role execution. Only the authenticated public invoker wrapper and private command entry are callable. Receipt SELECT is actor-private and requires current household membership. No entry foreign key is attached to the historical receipt, so later administrative deletion cannot erase retry identity.

Twenty-two focused database cases pass, including the nine existing read regressions and thirteen placement/authorization/fault/concurrency cases. No production database was accessed. API, native form and journaled AI placement remain subsequent work; no end-to-end placement or device execution is claimed.

## Shared API and private AI placement

The merged placement API validates the command and receipt through Effect, binds actor/household/operation/week/date/slot plus the exact next bigint revision, and calls the storage transaction with the user's bearer. Actual HTTP tests cover a lost committed response, subsequent partner removal, immutable retry and revoked recovery.

The gated AI journal extension dispatches `placeMeal` to that same transaction. It reuses the strict placement validator; account and retry identity remain server-bound. The old basic grocery/completion validation and dispatch bodies are extracted into private helpers without changing their behavior, keeping the finite router within function-size limits. Existing tool fixtures run the upgraded dispatcher for regression coverage; the new placement fixture uses actual audited meal/tenancy SQL plus the real journal, without pretending unrelated legacy stubs provide meal coverage.

Canonical history removes fabricated `tool-placeMeal` facts and reconstructs committed results. The SDK rejects unresolved placement history instead of discarding it. Tool/agent instructions allow only explicitly requested one-off meals; generated proposals still require separate approval and cannot be implemented by looping placement calls. This policy has not been exercised with a live model. The native result card links to the receipt's exact week, with strict route-parameter validation. Device navigation and the native placement form remain unverified/unimplemented respectively.
