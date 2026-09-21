import { mealRemovalFiles } from "./meal-removal-files.mjs";
// Actual audited meal/tenancy storage plus the private journal. Other tool branches
// are regression-tested in their existing fixtures, which include this dispatcher upgrade.
export const aiMealMoveFiles = [
  ...mealRemovalFiles,
  "supabase/migrations/20260920214557_native_meal_move_command.sql",
  "supabase/migrations/20260919220034_native_private_conversations.sql",
  "supabase/migrations/20260920022841_native_ai_turn_ownership.sql",
  "supabase/migrations/20260920033321_native_ai_command_journal.sql",
  "supabase/migrations/20260920153415_native_ai_chore_transfers.sql",
  "supabase/migrations/20260920171440_native_ai_meal_placement.sql",
  "supabase/migrations/20260920213543_native_ai_meal_removal.sql",
  "supabase/migrations/20260920220811_native_ai_meal_move.sql",
  "supabase/migrations/20260920223046_native_ai_meal_replacement.sql",
  "supabase/migrations/20260920234838_native_ai_recipe_creation.sql",
  "supabase/migrations/20260921001945_native_ai_recipe_archive.sql",
  "supabase/migrations/20260921005604_native_ai_recipe_edit.sql",
  "supabase/migrations/20260921015713_native_ai_recipe_selection.sql",
  "supabase/migrations/20260921022759_native_ai_meal_leftovers.sql",
];
