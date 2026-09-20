# Routine edit audit

Reference: legacy commit `4a528c96caf41515a70291ccecbba9d7b35e3349`. This is preparation for implementation, not completed edit-engine verification.

The installed versioned wrapper is `20260905002000_routine_edit_versions.sql`; its underlying definition update is the later meal-aware function from `20260904231923_meal_library_lifecycle_and_preparation.sql`. Window reconstruction comes from `20260830220000_preserve_reschedule_on_rebuild.sql`, with phase-aware date helpers from `20260830210000_biweekly_schedule.sql`. Do not use an older definition update or infer full engine behavior from the current creation fixture.

Edits must preserve these invariants:

- Exact microsecond version comparison; monotonic `updated_at` even for repeated mutations within one transaction.
- Lock current occurrence, then routine with NOWAIT, then remaining open/meal-linked occurrences with NOWAIT. Test closure/edit contention explicitly.
- If recurrence is unchanged, retain rescheduled due date, original recurrence anchor and reschedule timestamp. Retain planned alternating assignee when assignment is also unchanged.
- A linked meal-preparation routine keeps its durable occurrence identity. Finished preparation cannot change schedule/assignment; open preparation updates in place.
- Native edits change only requested title, recurrence or assignment. Preserve instructions, area/pet references, priority, active windows and other historical fields.
- A native operation receipt must bind actor, household and exact payload, with membership revalidated before replay. Legacy household-scoped edit keys alone are not a sufficient native retry boundary.
- An explicit takeover request still needs acceptance. Ordinary routine editing must not be presented as accepted transfer of existing assigned work.

`EditRoutine` was previously unused outside contract tests. It now carries a nonempty `patch` instead of replacing the whole definition. Omitted fields remain unchanged. Supplied titles retain the new 120 UTF-16-unit input limit; existing 120-codepoint legacy titles can remain untouched during schedule/assignment changes. Empty patches, explicit undefined/null and hidden legacy fields are rejected by strict decoding. This changes no deployed endpoint or database behavior.

Remaining work: audited fixture dependencies and meaningful legacy test selection, SQL/CAS/retry implementation, contention and linked-meal tests, API/native form, AI action and real-device verification. Notification helper dependencies must also be audited rather than replaced with successful no-op stubs.

## Isolated engine fixture

`tests/database/legacy-routine-edits` now contains selected actual legacy definitions: meal-link/completion tables, notification tables and helper functions, phase-aware window rebuilding, the latest meal-aware definition updater, and the versioned edit wrapper. The notification dispatcher is the final `20260905093553_project_coordination_history.sql` definition, preserving its existing catalog without importing project management. No successful no-op notification stub is used. Supporting tables are isolated with RLS and no direct client grants. These files are test resources, not production migrations.

A temporary disposable probe creates a native routine and invokes the actual legacy versioned title edit; it retains its two open occurrences. This is an initial fixture sanity check only. Five automated PostgreSQL cases now verify title-edit occurrence identity, replay and stale-version rejection, plus assignment rebuilding with preserved manual reschedule/anchor and a real deduplicated partner notice. Additional cases verify meal-linked occurrence identity and finished-date protection, concurrent same-version edits, and strictly monotonic versions inside one transaction. Closure-versus-edit lock contention and further recurrence boundaries remain to be tested with the native wrapper.
