import { files as choreFiles, id, json } from "./ai-chore-reminder-fixture.mjs";
import { recipeJournalFixture } from "./ai-recipe-creation-fixture.mjs";
export { id, json };
export const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; set request.jwt.claims='${JSON.stringify({ sub: actor })}'; ${sql}`;
export const files = [
  ...choreFiles,
  "tests/database/ai-meal-reminder-tables.sql",
  "supabase/migrations/20260923042902_native_meal_reminder_storage.sql",
  "supabase/migrations/20260923044619_native_ai_meal_reminders.sql",
];
export function mealContext(db) {
  const entryId = id(9800);
  db.sql(
    `insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot) values ('${entryId}','${id(10)}','2026-09-25','dinner','Synthetic soup')`,
  );
  const context = JSON.parse(
    db.sql(as(`select public.nest_read_meal_reminder('${id(10)}','${entryId}')`)),
  );
  const input = {
    entryId,
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
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','saveMealReminder',${json(value)})`;
  return { ...f, ...mealContext(f.db), turn, reminderCommand };
}
