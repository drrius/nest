# Routine rules reuse audit

Source: `/home/drrius/Work/household-os` commit `4a528c96caf41515a70291ccecbba9d7b35e3349`. These rules preserve legacy recurrence for M4. They are not a completed routine-management feature.

## Deliberately reused

`src/domain/routines/{types,dates,assignment,schedule,closure}.ts` supplied the pure civil-date calculations, two-member assignment rotation and current/preview closure planning. Nest splits validation and succession into bounded files/functions, removes area/pet/priority types and completion notes/photos, and exposes `@nest/domain/routines`. No React, database, infrastructure defaults or legacy screens were copied.

Calendar recurrence advances from the due date; monthly schedules clamp to the last day. Biweekly recurrence preserves the original pre-reschedule date. After-completion schedules advance from actual completion, or due date for skips. One-off schedules have no successor. Shared work has no assignee; alternating turns follow the planned assignee, independent of who completes. Matching calendar previews are promoted; completion-relative previews are rebuilt. Rescheduling leaves the preview untouched. Closing an inactive routine removes future work; this pure planner does not authorize closing an inactive routine.

Two deliberate corrections: civil years 0001–0099 no longer use JavaScript's special Date.UTC interpretation, and assignment validation rejects duplicate member IDs. Dates are positive four-digit ISO civil dates. Result overflow throws rather than silently changing representation.

Typed validators are pure domain checks, not an untrusted JSON decoder or authorization boundary. Future Effect command contracts must strictly decode, bind household members and constrain database integer ranges before calling them. No actor membership, transaction locking, idempotency or tenant-isolation claim is made for this module.

## Independent evidence

Meaningful scenarios from legacy `schedule.test.ts`, `assignment.test.ts` and `closure.test.ts` were re-expressed using node:test rather than copying Vitest infrastructure. Four seeded properties each exercise 1,000 cases: earliest eligible weekdays/biweekly phase, completion anchoring, assignment rotation and closure window counts. Boundary tests cover early years, leap centuries, month clamps, rescheduling, one-off/inactive closure and invalid targets.

`tests/database/legacy-routine-schedule.sql` copies only `private.first_routine_due_date` and `private.next_routine_due_date` from `supabase/migrations/20260830210000_biweekly_schedule.sql` at that commit. A disposable, socket-only PostgreSQL cluster compares both functions to TypeScript on 2,120 valid inputs, including early years, leap days, skips and rescheduled biweekly anchors. This fixture never accepts a production URL. It is not a migration. Both test suites run in existing routine CI.

## Remaining transactional audit

The existing Nest legacy chore fixture is synthetic and does not prove full recurrence. Before completing M4, rehearse the actual legacy routine engine plus authoritative overrides: biweekly scheduling, preservation of rescheduled windows, linked meal preparation, versioned edit receipts/locking and idempotent creation. Preserve historical area references without adding area-management scope. Verify concurrent current/preview counts, authorization/RLS, retries, edit conflicts, pause/archive and accepted takeover requests through real API/native/AI commands. Native/iPhone execution is still outstanding.
