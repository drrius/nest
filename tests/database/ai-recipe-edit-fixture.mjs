import { recipeJournalFixture, as, json } from "./ai-recipe-creation-fixture.mjs";
export { id, as, json } from "./ai-recipe-creation-fixture.mjs";
export { input, existing, added } from "./recipe-edit-fixture.mjs";
export function editJournalFixture(t) {
  const f = recipeJournalFixture(t);
  f.db.file("tests/database/meal-move-grocery-fixture.sql");
  f.db.sql(`insert into public.grocery_items(id,household_id,name)
    values('00000000-0000-4000-8000-000000000500','00000000-0000-4000-8000-000000000010','Existing groceries');
    insert into public.meal_plan_entries(household_id,date,slot,meal_definition_id,title_snapshot)
    values('00000000-0000-4000-8000-000000000010','2026-10-05','lunch','00000000-0000-4000-8000-000000000200','Historical soup')`);
  const command = (turn, value, call = "edit") =>
    `select public.nest_execute_ai_command('00000000-0000-4000-8000-000000000010','${turn.conversation}','${turn.turn}','${call}','editRecipe',${json(value)})`;
  const execute = (turn, value, call) =>
    JSON.parse(f.db.sql(as(command(turn, value, call), turn.actor)));
  return { ...f, command, execute };
}
export function editSnapshot(db) {
  return Object.fromEntries(
    [
      "meal_definitions",
      "meal_grocery_templates",
      "meal_plan_entries",
      "grocery_items",
      "nest_meal_library_revisions",
      "nest_recipe_edit_receipts",
      "nest_ai_commands",
    ].map((table) => [
      table,
      db.sql(
        `select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text from public.${table} r`,
      ),
    ]),
  );
}

export function boundedEditInput(bytes = 49152) {
  const value = {
    definitionId: "00000000-0000-4000-8000-000000000200",
    expectedRevision: "0",
    patch: { notes: "" },
    ingredients: Array.from({ length: 42 }, () => ({
      kind: "new",
      name: "Onion",
      quantity: "1/2",
      unit: "cup",
      categoryId: null,
      note: "x".repeat(1000),
    })),
  };
  const remaining = bytes - new TextEncoder().encode(JSON.stringify(value)).length;
  if (remaining < 0 || remaining > 8000) throw new Error("Invalid boundary fixture");
  value.patch.notes = "é".repeat(Math.floor(remaining / 2)) + (remaining % 2 ? "x" : "");
  return value;
}
