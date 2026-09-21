import { fixture as removalFixture, id, as, week } from "./meal-removal-fixture.mjs";
import { createRequire } from "node:module";
import {
  RecipePlacementReceipt,
  RecipeReplacementReceipt,
  PlannedRecipeEnvelope,
  PlaceRecipeInput,
  ReplaceWithRecipeInput,
} from "../../packages/contracts/src/recipe-selection.ts";
export { id, as, week, PlaceRecipeInput, ReplaceWithRecipeInput };
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
export const Schema = await import(require.resolve("effect/Schema"));
export const migration = "supabase/migrations/20260921011002_native_planned_recipe_snapshots.sql";
export const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
export const input = (patch = {}) => ({
  weekStart: week,
  expectedRevision: "0",
  date: week,
  slot: "dinner",
  definitionId: id(200),
  expectedLibraryRevision: "0",
  ...patch,
});
export const command = (
  operation,
  value = input(),
  replace = false,
  { actor = id(1), home = id(10) } = {},
) =>
  as(
    `select public.${replace ? "nest_replace_with_recipe" : "nest_place_recipe"}('${home}','${operation}',${json(value)})`,
    actor,
  );
const decode = (schema, text) =>
  Schema.decodeUnknownSync(schema)(JSON.parse(text), { onExcessProperty: "error" });
export function fixture(t) {
  const f = removalFixture();
  t?.after(() => f.db.stop());
  const { db } = f;
  for (const file of [
    "supabase/migrations/20260920214557_native_meal_move_command.sql",
    "supabase/migrations/20260920221646_native_meal_replacement_command.sql",
    "tests/database/recipe-selection-library-fixture.sql",
    "tests/database/meal-library-fixture.sql",
    "supabase/migrations/20260920224313_native_meal_library_reads.sql",
    "supabase/migrations/20260920231423_native_recipe_creation.sql",
    "supabase/migrations/20260921002813_native_recipe_edit.sql",
    "tests/database/meal-move-grocery-fixture.sql",
    migration,
  ])
    db.file(file);
  db.sql(
    `insert into public.grocery_items(id,household_id,name) values('${id(500)}','${id(10)}','Existing groceries')`,
  );
  const select = (operation, value = input(), replace = false, scope = {}) =>
    decode(
      replace ? RecipeReplacementReceipt : RecipePlacementReceipt,
      db.sql(command(operation, value, replace, scope)),
    );
  const read = (entry, revision, actor = id(1), { home = id(10), start = week } = {}) =>
    decode(
      PlannedRecipeEnvelope,
      db.sql(
        as(
          `select public.nest_planned_recipe('${home}','${start}','${revision}','${entry}')`,
          actor,
        ),
      ),
    );
  const snapshot = () =>
    Object.fromEntries(
      [
        "meal_definitions",
        "meal_grocery_templates",
        "meal_plan_entries",
        "nest_meal_week_revisions",
        "nest_meal_library_revisions",
        "nest_planned_recipe_snapshots",
        "nest_recipe_selection_receipts",
        "nest_meal_removal_receipts",
        "routine_occurrences",
        "routine_command_receipts",
        "reminder_candidates",
        "inbox_notifications",
        "activity_events",
        "grocery_items",
      ].map((table) => [
        table,
        db.sql(
          `select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') from public.${table} r`,
        ),
      ]),
    );
  return { ...f, select, read, snapshot };
}
