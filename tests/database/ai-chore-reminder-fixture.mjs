import { files as previous, id, json } from "./ai-renewal-fixture.mjs";
import { recipeJournalFixture } from "./ai-recipe-creation-fixture.mjs";
export { id, json };
export const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; set request.jwt.claims='${JSON.stringify({ sub: actor })}'; ${sql}`;
export const files = [
  ...previous,
  "tests/database/legacy-routines/schedule-validation.sql",
  "tests/database/ai-chore-reminder-tables.sql",
  "tests/database/legacy-routines/dates.sql",
  "tests/database/legacy-routines/insertion.sql",
  "supabase/migrations/20260920082522_native_routine_creation.sql",
  "supabase/migrations/20260920143047_native_chore_transfer_storage.sql",
  "supabase/migrations/20260922213246_native_renewal_reminder_storage.sql",
  "supabase/migrations/20260922220043_native_ai_renewal_reminders.sql",
  "supabase/migrations/20260923033231_native_chore_reminder_storage.sql",
  "supabase/migrations/20260923035749_native_ai_chore_reminders.sql",
];
export function choreContext(db) {
  const routine = JSON.parse(
    db.sql(
      as(
        `select public.nest_create_routine('${id(10)}','${id(9000)}',${json({ title: "Synthetic reminder chore", schedule: { kind: "daily" }, assignment: { policy: "shared" } })})`,
      ),
    ),
  );
  const occurrenceId = db.sql(
    `select id from public.routine_occurrences where routine_id='${routine.routineId}' and role='current'`,
  );
  const context = JSON.parse(
    db.sql(as(`select public.nest_read_chore_reminder('${id(10)}','${occurrenceId}')`)),
  );
  const input = {
    occurrenceId,
    expectedItemRevision: context.itemRevision,
    expectedRevision: null,
    settings: { enabled: true, recipientIds: [id(1), id(2)], localTime: "09:00", daysBefore: 0 },
  };
  return { input, context };
}
export function setup(t) {
  const f = recipeJournalFixture(t, files),
    turn = f.start();
  const reminderCommand = (value, call = "reminder") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','saveChoreReminder',${json(value)})`;
  return { ...f, ...choreContext(f.db), turn, reminderCommand };
}
