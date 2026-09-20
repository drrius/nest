# Next M5 slice: manual meal edits

Reference source verified at 4a528c96caf41515a70291ccecbba9d7b35e3349. No production data read.

The legacy 20260811180000_meals_groceries.sql move command locks the entry, validates active leftovers' dates, moves it and can materialize groceries for an unmaterialized saved meal. Nest cannot directly reuse that command: ingredient review must remain separate. Preserve existing entry identity, snapshots, notes, provenance and groceries_materialized_at when moving.

The legacy remove command soft-removes the entry, finds the current open linked preparation occurrence and invokes private.apply_routine_closure with skip. That closure advances recurrence and may generate notices; native removal must deliberately preserve the audited behavior and roll back every side effect if the receipt fails. It must not delete previously completed preparation or groceries/history.

The latest leftover validator (20260905072131_serialize_leftover_source_dates.sql) locks the source FOR SHARE during child changes and checks active child dates when a source date changes. Removal-only updates do not fire the existing trigger. A new removal transaction must serialize against child insertion/moves before checking for active dependents. Reject removing a source with active leftovers rather than silently removing or detaching their history. A user can explicitly remove those dependent planned entries first. Add real concurrent child-create/remove proofs.

Use actor-private immutable receipts after current membership authorization; exact complete-week revisions detect stale/ABA edits. Cross-week moves need both explicit expected revisions, deterministic week locking and both returned revisions. Do not infer baselines from updated_at. Preserve original receipt after later partner edits/removal. Test inversion with legacy row-first writers; surface bounded lock/deadlock conflicts without partial changes.

Replace should retain removed old entry history and insert a new independently identified entry atomically, with explicit source/target baseline and occupied-slot semantics. Audit meal-linked preparation and leftovers before exposing it. Saved meal selection additionally needs audited library authorization/snapshot contracts; it is not equivalent to a title-only one-off.

Pending: choose coherent transaction/contract slice, add audited real closure fixture dependencies, write invariants and then shared API/native/AI actions. This note is an implementation audit, not implemented behavior or verification evidence.

## Required verification before exposing edits

| Invariant                  | Required fixture proof                                                                                                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicit ingredient review | Move an unmaterialized saved meal; grocery rows, provenance and materialization marker remain unchanged.                                                                                                          |
| Immutable recovery         | Lose a committed edit response, perform later partner work, retry the original operation and receive its original receipt without restoring old content.                                                          |
| Atomic cross-week change   | Race moves in opposite directions; compare both exact revisions and prove at most one accepted baseline per changed week.                                                                                         |
| Leftover integrity         | Race source removal/date change against child insertion and child movement. Every committed active child retains an active earlier source. Include cross-week dependencies.                                       |
| Linked preparation history | Remove with current open, completed, rescheduled and archived/paused preparation states; verify occurrence identities, terminal history, reminder changes and successor behavior using the actual closure engine. |
| Full rollback              | Force final receipt insertion failure; compare meal rows, week counters, routine definitions/occurrences, notices, reminders and both receipt layers.                                                             |
| Authorization              | Both members can act within their household; outsiders and anonymous users cannot inspect or mutate entries. Revoked membership blocks old receipt replay.                                                        |
| Native recovery            | Ambiguous response freezes the command; conflict requires an explicit fresh read; account switches dispose old drafts; financial/grocery outboxes remain unchanged.                                               |

The existing leftover trigger is specifically `before insert or update of household_id, date, leftover_of_entry_id` (original meal migration lines 336–340). Adding a check only inside a native removal RPC would leave legacy direct removal unguarded; compatibility needs a shared database invariant or an explicitly gated legacy-writer cutover. The full source-removal race test must include the legacy write path, not merely two new native commands.

The reused closure body, if needed, must be the audited `20260830220000_preserve_reschedule_on_rebuild.sql` implementation, already extracted in `tests/database/legacy-routine-edits/closure.sql`. Do not assume its generic recurrence advancement is correct for every meal-linked routine; inspect the actual meal-preparation creation and linkage rules before choosing removal semantics.

## Source-removal integrity candidate

The additive `20260920202549_native_meal_removal_integrity.sql` candidate adds a source-removal guard to the existing table, so legacy soft-removal writes also participate. The source UPDATE lock conflicts with the audited leftover validator's shared source lock. An active child in any week blocks source removal. Restoring a soft-removed entry invokes the existing full leftover validator, acquiring the same source lock and checking current source date/type/removal state. Direct function execution is revoked; existing RLS and write grants are unchanged.

The removal guard requires read-committed transactions and returns a serialization conflict for other isolation levels. A repeatable snapshot could otherwise hide a child committed after that snapshot even after waiting for its lock. This compatibility restriction must be included in the production migration rehearsal; no deployment is authorized here.

Eight disposable PostgreSQL cases pass: source/removal across weeks; both ordered child-insert/removal races; both restore/removal races; date/type validation and rollback; preservation of existing orphan history with explicit cleanup allowed; and repeatable-snapshot rejection. Isolated security advisors report no issues. The migration does not scan, repair or delete historical inconsistencies. These require a later bounded migration rehearsal report. Hard deletion and arbitrary legacy trigger-disabling administrative writes remain outside native commands; no broad historical repair is claimed.

This is a prerequisite invariant, not a completed manual-edit workflow. Native move/replace/remove, their shared authorized commands and private AI tools still require implementation and verification.

## Linked preparation follow-up

At the pinned legacy commit, `public.create_meal_preparation` in `20260811180000_meals_groceries.sql` (lines 991–1115) locks the meal entry, rejects removed entries or an existing linked occurrence, and creates a one-off routine with `active_from = active_until = p_due_on` and `meal_deadline` priority. It links the current occurrence, not a recurring definition. The audited definition editor (`tests/database/legacy-routine-edits/definition.sql`) locks the linked occurrence before its routine and explicitly rejects changing meal preparation to a recurring schedule.

Removal must retain the meal-row lock while finding and closing linked preparation, to serialize against concurrent legacy preparation creation. The real closure retains the skipped occurrence and cancels pending reminder candidates and its inbox reminder. Its successor logic must be exercised with actual one-off, rescheduled, paused/archived and already-completed shapes before reuse. Completed preparation history is not a current open task to skip. Existing legacy household-scoped receipts must not own new native retry identity.

These findings narrow the next transaction's fixture requirements; they do not introduce a new preparation feature or claim that native removal has been implemented.

## Authorized removal command candidate

`20260920203938_native_meal_removal_command.sql` adds a strict entry/week/revision command with actor-private immutable receipts. Current membership is locked before any receipt replay. New operations lock the complete week, compare its exact decimal revision, then lock the scoped meal entry and require that it is still active in that week. Soft-removal and any current open linked preparation skip run atomically with the receipt. A fresh server-generated legacy closure key prevents preseeded household receipt collisions; the native receipt owns retry identity.

The real audited closure is exercised with one-off, completed, rescheduled, paused and archived preparation. Meal snapshots, notes, grocery-materialization markers and closed preparation history are retained. Existing groceries and financial data are not commands in this transaction. Active leftovers prevent removal through the shared invariant. Conflicts, deadlocks and lock timeouts roll back; retry of a committed operation returns its historical receipt even after partner restoration.

Twelve disposable PostgreSQL command/authorization/closure/race cases pass, including five concurrent identical retries, competing member removals, legacy edit contention, lock-timeout recovery, revoked receipt replay, private receipt visibility and forced receipt-failure rollback across meals, week counters, routines, occurrences, reminders, inbox notices, activity and closure receipts. The fixture combines the already audited full meal table shapes from routine-edit fixtures with the current meal triggers and actual closure; it does not stub preparation behavior. Security advisors report no issues. API, native removal controls and private AI journal wiring remain outstanding; no production migration was run.

## Move command follow-up audit

Pinned-source search confirms `20260811180000_meals_groceries.sql:728` is the only legacy `public.move_meal_plan_entry` definition. It updates only the meal date/slot before optional grocery materialization and activity. It does not reschedule linked preparation. Native move will preserve existing entry identity, snapshot/provenance/materialization fields and preparation timing/history; no implicit grocery addition or preparation reschedule.

Use explicit source and destination complete-Monday-week baselines; for same-week movement require the two supplied baselines to agree and increment that week once. Lock distinct week rows in date order, then the scoped active entry. Recheck the entry belongs to the supplied source week and require a different destination date/slot. Reject occupied targets through the active-slot invariant. Return both exact resulting revisions, with one immutable actor-private receipt. Handle legacy row-first lock inversions as bounded retryable conflicts without partial state. Reject non-read-committed execution before new writes so a stale transaction snapshot cannot bypass the shared leftover guard.

Verification must include unchanged saved-meal grocery/materialization data, preparation occurrence/definition/reminder identity, same-week and cross-week increments, opposite-direction races, both baseline conflicts, active leftover ordering, immutable recovery after later partner work and final-receipt rollback. This is a design decision and audit, not implemented behavior.

## Native move storage candidate

`20260920214557_native_meal_move_command.sql` implements the audited move behavior with strict Effect/SQL inputs and actor-private immutable receipts. It locks both week counters in sorted order before the entry, validates both baselines and keeps existing meal identity, snapshots, saved-definition linkage, materialization state and preparation history. Same-week movement advances one counter once. Occupied slots, invalid leftover ordering and bounded legacy lock conflicts roll back. No-op moves are rejected explicitly. Non-read-committed new mutations are rejected; committed receipts remain recoverable after later changes while current membership remains required.

Twelve real PostgreSQL cases pass, including both ordered leftover insertion/source movement races, five identical concurrent retries, opposing cross-week moves, legacy row-first contention, rollback after final receipt failure and revoked/private receipt access. Three contract checks cover bigint and same-week constraints and all destination days around representative civil-date boundaries. Disposable security advisors report no issues. Storage is a candidate awaiting CI/review; API/native/AI move integration remains unimplemented.
