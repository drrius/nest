import { files as leftoverFiles, week } from "./ai-meal-leftovers-fixture.mjs";
import { recipeJournalFixture, id, as, json } from "./ai-recipe-creation-fixture.mjs";
export { id, as, json, week };
export const files = [
  ...leftoverFiles,
  "supabase/migrations/20260921024101_native_meal_preparation.sql",
  "supabase/migrations/20260921024848_native_meal_preparation_read.sql",
];
export const input = (patch = {}) => ({
  entryId: id(800),
  weekStart: week,
  expectedRevision: "1",
  preparation: {
    title: "Soak beans",
    instructions: "Cold water",
    dueOn: "2030-01-06",
    assignment: { policy: "shared" },
  },
  ...patch,
});
export function seed(db) {
  db.sql(
    `insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot) values ('${id(800)}','${id(10)}','${week}','dinner','Beans')`,
  );
}
export function fixture(t) {
  const f = recipeJournalFixture(t, files);
  seed(f.db);
  const command = (turn, value, call = "preparation") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','createMealPreparation',${json(value)})`;
  const execute = (turn, value, call) =>
    JSON.parse(f.db.sql(as(command(turn, value, call), turn.actor)));
  return { ...f, command, execute };
}
