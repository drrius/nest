import { createRequire } from "node:module";
import { fixture as libraryFixture, mealLibraryFiles, id, as } from "./meal-library-fixture.mjs";
import { RecipeCreationReceipt } from "../../packages/contracts/src/recipe-creation.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
export { id, as };
export const recipeCreationMigration =
  "supabase/migrations/20260920231423_native_recipe_creation.sql";
export const recipeCreationFiles = [...mealLibraryFiles, recipeCreationMigration];
export const input = (expectedRevision = "0") => ({
  expectedRevision,
  recipe: {
    title: "Tomato soup",
    servings: 2,
    instructions: "Simmer gently. Blend.",
    recipeUrl: "https://example.com/soup",
    notes: "Family version",
    ingredients: [
      { name: "Tomatoes", quantity: "1/2", unit: "cup", categoryId: null, note: "Chopped" },
      { name: "Tomatoes", quantity: "250", unit: "g", categoryId: null, note: null },
    ],
  },
});
export const command = (operation, payload = input(), scope = {}) =>
  as(
    `select public.nest_create_recipe('${scope.household ?? id(10)}','${operation}','${JSON.stringify(payload).replaceAll("'", "''")}')`,
    scope.actor,
  );
export function fixture(t) {
  const f = libraryFixture(t),
    { db } = f;
  db.file(recipeCreationMigration);
  db.file("tests/database/meal-move-grocery-fixture.sql");
  db.sql(`insert into public.grocery_categories(id,household_id,name,sort_order,archived_at) values
    ('${id(400)}','${id(10)}','Produce',0,null),('${id(401)}','${id(20)}','Foreign',0,null),('${id(402)}','${id(10)}','Archived',1,now());
    insert into public.grocery_items(id,household_id,name) values('${id(500)}','${id(10)}','Existing groceries')`);
  const create = (operation, payload = input(), scope) =>
    Schema.decodeUnknownSync(RecipeCreationReceipt)(
      JSON.parse(db.sql(command(operation, payload, scope))),
      { onExcessProperty: "error" },
    );
  const snapshot = () =>
    Object.fromEntries(
      [
        "meal_definitions",
        "meal_grocery_templates",
        "nest_meal_library_revisions",
        "nest_recipe_creation_receipts",
        "meal_plan_entries",
        "nest_meal_week_revisions",
        "grocery_items",
      ].map((table) => [
        table,
        db.sql(
          `select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text from public.${table} r`,
        ),
      ]),
    );
  return { ...f, create, snapshot };
}
