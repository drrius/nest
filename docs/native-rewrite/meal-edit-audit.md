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
