import { recipeJournalFixture, as, json } from "./ai-recipe-creation-fixture.mjs";
export { id, as, json } from "./ai-recipe-creation-fixture.mjs";
export { input } from "./recipe-archive-fixture.mjs";
export function archiveJournalFixture(t) {
  const f = recipeJournalFixture(t);
  f.db.file("tests/database/meal-move-grocery-fixture.sql");
  f.db.sql(`insert into public.grocery_items(id,household_id,name)
    values('00000000-0000-4000-8000-000000000500','00000000-0000-4000-8000-000000000010','Existing groceries');
    insert into public.meal_plan_entries(household_id,date,slot,meal_definition_id,title_snapshot)
    values('00000000-0000-4000-8000-000000000010','2026-10-05','lunch','00000000-0000-4000-8000-000000000200','Historical soup')`);
  const command = (turn, value, call = "archive") =>
    `select public.nest_execute_ai_command('00000000-0000-4000-8000-000000000010','${turn.conversation}','${turn.turn}','${call}','archiveRecipe',${json(value)})`;
  const execute = (turn, value, call) =>
    JSON.parse(f.db.sql(as(command(turn, value, call), turn.actor)));
  return { ...f, command, execute };
}
export function archiveSnapshot(db) {
  return Object.fromEntries(
    [
      "meal_definitions",
      "meal_grocery_templates",
      "meal_plan_entries",
      "grocery_items",
      "nest_meal_library_revisions",
      "nest_recipe_archive_receipts",
      "nest_ai_commands",
    ].map((table) => [
      table,
      db.sql(
        `select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text from public.${table} r`,
      ),
    ]),
  );
}
