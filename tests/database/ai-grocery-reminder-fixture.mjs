import { files as mealFiles, id, json, as } from "./ai-meal-reminder-fixture.mjs";
import { recipeJournalFixture } from "./ai-recipe-creation-fixture.mjs";
export { id, json, as };
export const files = [
  ...mealFiles,
  "tests/database/ai-grocery-reminder-tables.sql",
  "supabase/migrations/20260919214311_native_grocery_check_receipts.sql",
  "supabase/migrations/20260920002735_native_grocery_commands.sql",
  "supabase/migrations/20260923051033_native_dated_reminder_settings.sql",
  "supabase/migrations/20260923051148_native_grocery_reminder_storage.sql",
  "supabase/migrations/20260923052943_native_ai_grocery_reminders.sql",
];
export function groceryContext(db) {
  const itemId = id(9800);
  db.sql(
    `insert into public.grocery_items(id,household_id,name) values('${itemId}','${id(10)}','Milk')`,
  );
  const context = JSON.parse(
    db.sql(as(`select public.nest_read_grocery_reminder('${id(10)}','${itemId}')`)),
  );
  const input = {
    itemId,
    expectedItemVersion: context.itemVersion,
    expectedRevision: null,
    settings: {
      enabled: true,
      recipientIds: [id(1), id(2)],
      localTime: "09:00",
      localDate: "2026-10-01",
    },
  };
  return { input, context };
}
export function setup(t) {
  const f = recipeJournalFixture(t, files),
    turn = f.start();
  const reminderCommand = (value, call = "reminder") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','saveGroceryReminder',${json(value)})`;
  return { ...f, ...groceryContext(f.db), turn, reminderCommand };
}
