# Manual meal weeks: source audit and implementation boundary

20 September 2026. Reference commit: `household-os` `4a528c96caf41515a70291ccecbba9d7b35e3349`. No production records were read. The approved Nest brief is authoritative.

## Audited source

`supabase/migrations/20260811180000_meals_groceries.sql` defines the existing meal definitions, grocery templates and planned entries. Planned entries retain their UUID, household, date, optional slot, definition reference, title/link snapshots, notes, leftover source, grocery-materialization marker and removal history. Composite foreign keys bind definition and leftover references to the household. A partial unique index permits one active entry per household/date/non-null slot. Null slots represent Monday ideas; Nest does not delete or silently place those historical records.

The same migration's `public.place_meal` invokes `private.materialize_meal_groceries` for a slotted library meal. Reusing this RPC would add groceries before the separate review required by Nest. Its household-wide legacy receipt identity also does not establish the new actor-bound command contract. The legacy function is not imported or exposed to the native client or assistant.

The leftover trigger rejects missing/removed sources, nested leftovers and sources on the same or a later day. It validates the row being inserted or moved; by itself it does not protect dependents when the source later moves or is removed. Native write transactions must explicitly validate that relationship and test races. Merely reusing that trigger would be insufficient evidence.

Legacy entry/definition `updated_at` uses transaction `now()`. It is not a monotonic edit generation: multiple updates in one transaction can share a timestamp. Native week concurrency therefore must not infer an untouched week from these timestamps or a list of currently occupied slots; empty-slot races and remove/reinsert changes also matter.

Only these source sections have been audited for this first read-contract slice. Later legacy move, removal, recipe-edit and template lifecycle migrations need their own targeted audit before reuse. No legacy SQL or UI was copied into this change. Date helpers reuse Nest's already audited pure civil-date rules.

## Read contract now implemented

A snapshot is one explicit Monday–Sunday week, household UUID, decimal-string bigint revision and at most 21 active slotted entries. Validation rejects duplicate entry IDs, duplicate date/slot pairs, dates outside the requested week and self-referencing leftovers. Cross-week leftover references are retained, not guessed invalid because the source is outside this snapshot. Configured visible slots affect presentation only; reads must retain all three slot types so hidden meals cannot be overwritten unknowingly.

Stored title validation follows PostgreSQL's ASCII-space trim and Unicode code-point limit, including existing padded titles. Notes and recipe links retain their existing code-point limits and are not normalized. A stored link is data, not permission to open an arbitrary URL scheme; the eventual native opener must independently permit HTTP(S) only. New edit forms may impose narrower input limits without rewriting untouched history.

The pure week helper uses civil dates and UTC arithmetic. It returns all seven days regardless of timezone/DST and rejects partial weeks beyond the supported years 0001–9999. The last complete Monday is 9999-12-20. Adjacent navigation rejects crossing that range instead of wrapping.

## Next transaction work — not implemented by the read contract

- Add gated per-household/week monotonic revisions, maintained for all relevant legacy and native entry writes, including moves between weeks. Read entries and revision from one authenticated, RLS-backed statement snapshot.
- Native manual writes bind a stable actor/household/operation identity, exact payload and expected week revision. Check explicit occupied-slot identity before replacement. Cross-week moves lock and validate both weeks; stale forms must conflict rather than silently overwrite.
- Preserve entry IDs, history, recipe snapshots and grocery provenance. Do not clear materialization markers or post groceries/money as a side effect. Define and test dependent-leftover behavior before enabling moves/removal.
- Add shared authorized services, native seven-day board/forms, corresponding private AI tools and lost-response/concurrent-partner integration tests. Manual actions remain online-only; loaded snapshots may be viewed offline.
- Saved recipe detail, generated proposals with exact visible revision approval, and separate idempotent ingredient review remain subsequent M5 slices. The read contract does not implement any of these actions.

All additive database changes remain gated from production deployment. This document does not authorize migration or cutover.
