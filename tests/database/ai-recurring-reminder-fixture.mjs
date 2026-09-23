import { files as groceryFiles, id, json, as } from "./ai-grocery-reminder-fixture.mjs";
import { recipeJournalFixture } from "./ai-recipe-creation-fixture.mjs";
import { input as ruleInput } from "../api/recurring-transport-fixture.mjs";
export { id, json, as };
export const files = [
  ...groceryFiles,
  "supabase/migrations/20260923055905_native_recurring_reminder_storage.sql",
  "supabase/migrations/20260923061318_native_ai_recurring_reminders.sql",
];
export function recurringContext(db) {
  const today = db.sql(
    "select to_char(clock_timestamp() at time zone 'Europe/Zurich','YYYY-MM-DD')",
  );
  const rule = { ...ruleInput(today), ruleId: id(9800) };
  const saved = JSON.parse(
    db.sql(as(`select public.nest_save_recurring('${id(10)}','${id(9801)}',${json(rule)})`)),
  );
  const context = JSON.parse(
    db.sql(as(`select public.nest_read_recurring_reminder('${id(10)}','${rule.ruleId}')`)),
  );
  const input = {
    ruleId: rule.ruleId,
    expectedRuleRevision: saved.revision,
    expectedDueOn: rule.firstDueOn,
    expectedRevision: null,
    settings: { enabled: true, recipientIds: [id(1), id(2)], localTime: "09:00", daysBefore: 0 },
  };
  return { input, context };
}
export function setup(t) {
  const f = recipeJournalFixture(t, files),
    turn = f.start();
  const reminderCommand = (value, call = "reminder") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','saveRecurringReminder',${json(value)})`;
  return { ...f, ...recurringContext(f.db), turn, reminderCommand };
}
