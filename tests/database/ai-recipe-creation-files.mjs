import { aiMealReplacementFiles } from "./ai-meal-replacement-files.mjs";
import { recipeCreationFiles } from "./recipe-creation-fixture.mjs";
export const aiRecipeCreationFiles = [
  ...new Set([
    ...recipeCreationFiles,
    "supabase/migrations/20260921002813_native_recipe_edit.sql",
    ...aiMealReplacementFiles.slice(
      aiMealReplacementFiles.indexOf(
        "supabase/migrations/20260919220034_native_private_conversations.sql",
      ),
    ),
    "supabase/migrations/20260920234838_native_ai_recipe_creation.sql",
    "supabase/migrations/20260920235917_native_recipe_archive.sql",
    "supabase/migrations/20260921001945_native_ai_recipe_archive.sql",
    "supabase/migrations/20260921005604_native_ai_recipe_edit.sql",
    "supabase/migrations/20260921015713_native_ai_recipe_selection.sql",
    "supabase/migrations/20260921022759_native_ai_meal_leftovers.sql",
    "supabase/migrations/20260921031147_native_ai_meal_preparation.sql",
    "supabase/migrations/20260921034355_native_ai_preparation_editing.sql",
  ]),
];
