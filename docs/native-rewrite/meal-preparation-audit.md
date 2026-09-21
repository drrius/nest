# Linked meal preparation audit

Reference: Household OS commit `4a528c96caf41515a70291ccecbba9d7b35e3349`. Audited `supabase/migrations/20260811180000_meals_groceries.sql` (`create_meal_preparation`), `20260904231923_meal_library_lifecycle_and_preparation.sql` (linked-task edit behavior), `src/lib/meals/preparation.ts`, and `src/lib/forms/meal-preparation.ts`. These files are reference material, not copied application code.

## Behavior to preserve

A meal can have one linked preparation occurrence, created with a one-off routine, explicit date/title/instructions and household assignment. A removed meal cannot acquire preparation. Existing completed/skipped preparation remains history; creating a second preparation is not a reset mechanism. Editing linked preparation must keep it one-off. Finished preparation retains its date and assignee, although title/instructions may be corrected. Meal movement does not silently reschedule preparation. Meal removal/replacement skips open preparation through the already audited closure engine and retains finished history. Leftover creation does not inherit preparation.

The approved native brief retains meal preparation and nonblocking availability warnings. This is household work, never a financial obligation or a calendar event. Existing date-only tasks have no invented start time/duration; no false busy/free verdict can be inferred from a civil due date. Any later timed scheduling control needs an explicit interval and authorized availability coverage before a meaningful warning.

## Native boundary

Creation requires current membership, exact meal entry/week revision, an operation UUID and explicit task data. The server must lock the meal against removal, check absence of any prior linked occurrence, validate the assignee against the current household and insert routine/occurrence/link/activity/receipt atomically. Replay authorization precedes receipt lookup; retries return the original immutable receipt even after later edits or completion. An injected receipt failure must roll back the task and link.

Use existing audited Nest routine insertion and date/assignment rules deliberately, with a server-selected compatibility area. Never copy cookie-bound services, legacy area selection UI or household-wide text idempotency keys. Preserve legacy instruction text on reads; new input rejects NUL, malformed Unicode and oversized text. Do not add recipes, groceries, reminder consent or EventKit writes as a side effect. Exposing create/read is only an implementation increment: native controls, corresponding private AI, update/closure journeys and device verification remain required.

## Verification required

- Concurrent create/create and create/remove races, exact retry after later edits/completion, current membership and foreign meal/assignee denial.
- Full transaction rollback; no orphan routine, occurrence, link, activity or receipt; at most one linked occurrence.
- Exact input and receipt bindings, microsecond routine versions, valid civil dates, Unicode boundaries and unknown legacy fields.
- Actual API/native/SDK journeys, uncertainty and authorization recovery, explicit read-only stale state, and native accessibility/navigation checks when a phone is available.

This audit does not claim an implemented or verified preparation command. All planned SQL testing is against disposable synthetic fixtures; production remains separately gated.
