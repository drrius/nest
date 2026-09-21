import {
  fixture as selection,
  input as recipeInput,
  id,
  as,
  json,
  Schema,
  week,
} from "./recipe-selection-fixture.mjs";
import {
  MealIngredientsReceipt,
  MealIngredientPage,
} from "../../packages/contracts/src/meal-ingredients.ts";
export { id, as, json, week };
export const migration = "supabase/migrations/20260921081205_native_meal_ingredient_additions.sql";
export function fixture(t) {
  const f = selection(t);
  installIngredientStorage(f.db);
  const placed = f.select(id(800), recipeInput());
  const snapshot = f.read(placed.entryId, placed.revision).snapshot;
  const input = (patch = {}) => ({
    weekStart: week,
    expectedRevision: placed.revision,
    selected: snapshot.recipe.ingredients.map((i) => ({
      entryId: placed.entryId,
      ingredientId: i.ingredientId,
      quantity: i.quantity,
      unit: i.unit,
    })),
    ...patch,
  });
  const command = (operation, value = input(), scope = {}) =>
    as(
      `select public.nest_add_meal_ingredients('${scope.home ?? id(10)}','${operation}',${json(value)})`,
      scope.actor,
    );
  const add = (...args) =>
    Schema.decodeUnknownSync(MealIngredientsReceipt)(JSON.parse(f.db.sql(command(...args))), {
      onExcessProperty: "error",
    });
  const review = (after = null, scope = {}) =>
    Schema.decodeUnknownSync(MealIngredientPage)(
      JSON.parse(
        f.db.sql(
          as(
            `select public.nest_read_meal_ingredients('${scope.home ?? id(10)}','${week}','${scope.revision ?? placed.revision}',${json(after)})`,
            scope.actor,
          ),
        ),
      ),
      { onExcessProperty: "error" },
    );
  return { ...f, placed, snapshot, input, command, add, review };
}

export function installIngredientStorage(db) {
  // Only the audited legacy grocery columns needed by the new writer; no production data.
  db.sql(
    `alter table public.grocery_items add column quantity text check(length(quantity)<=80), add column unit text check(length(unit)<=80), add column category_id uuid, add column note text check(length(note)<=1000), add column originating_meal_plan_entry_id uuid, add column sort_order integer not null default 0; alter table public.grocery_items add constraint fixture_name check(length(trim(name)) between 1 and 120)`,
  );
  db.file(migration);
  db.file("supabase/migrations/20260921081725_native_meal_ingredient_review.sql");
}
