import { choreChangeFiles } from "./chore-change-files.mjs";
export const aiChoreChangeFiles = [
  ...choreChangeFiles,
  "supabase/migrations/20260919220034_native_private_conversations.sql",
  "supabase/migrations/20260920022841_native_ai_turn_ownership.sql",
  "supabase/migrations/20260920033321_native_ai_command_journal.sql",
  "supabase/migrations/20260920091316_native_ai_routine_creation.sql",
  "supabase/migrations/20260920100014_native_ai_routine_editing.sql",
  "supabase/migrations/20260920103624_native_ai_routine_lifecycle.sql",
  "supabase/migrations/20260920141458_native_ai_chore_changes.sql",
  "supabase/migrations/20260920153415_native_ai_chore_transfers.sql",
  "supabase/migrations/20260920171440_native_ai_meal_placement.sql",
  "supabase/migrations/20260920213543_native_ai_meal_removal.sql",
];
