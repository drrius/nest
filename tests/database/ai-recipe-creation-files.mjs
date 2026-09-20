import { aiMealReplacementFiles } from "./ai-meal-replacement-files.mjs";
import { recipeCreationFiles } from "./recipe-creation-fixture.mjs";
export const aiRecipeCreationFiles = [
  ...new Set([
    ...recipeCreationFiles,
    ...aiMealReplacementFiles.slice(
      aiMealReplacementFiles.indexOf(
        "supabase/migrations/20260919220034_native_private_conversations.sql",
      ),
    ),
    "supabase/migrations/20260920234838_native_ai_recipe_creation.sql",
  ]),
];
