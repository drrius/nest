import { recipeSelectionFiles, id, json, week } from "./recipe-selection-fixture.mjs";
export { id, week };
export const oneOffMigration =
  "supabase/migrations/20260921043035_native_one_off_recipe_snapshots.sql";
export const oneOffFiles = [
  ...recipeSelectionFiles,
  oneOffMigration,
  "supabase/migrations/20260921020754_native_meal_leftovers.sql",
];
export const oneOffRecipe = {
  definitionId: null,
  title: "Roasted carrots",
  servings: 2,
  instructions: "Roast until tender.",
  recipeUrl: null,
  notes: "Keep the peel.",
  ingredients: [
    {
      ingredientId: id(950),
      name: "Carrots",
      quantity: "1/2",
      unit: "kg",
      categoryId: null,
      note: null,
      order: 0,
    },
  ],
};
export function seedOneOff(db) {
  db.sql(`insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot,notes)
    values('${id(940)}','${id(10)}','${week}','lunch','Roasted carrots','Keep the peel.');
    insert into public.nest_planned_recipe_snapshots(household_id,entry_id,library_revision,recipe)
    values('${id(10)}','${id(940)}',null,${json(oneOffRecipe)});`);
}
