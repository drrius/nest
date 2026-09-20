// Actual audited routine creation/edit engine plus private conversation/turn journal.
// Unrelated dispatcher branches are not exercised by this focused fixture.
export const aiRoutineFiles = [
  "tests/database/routine-edit-fixture.sql",
  "tests/database/legacy-routine-edits/lifecycle.sql",
  "supabase/migrations/20260919220034_native_private_conversations.sql",
  "supabase/migrations/20260920022841_native_ai_turn_ownership.sql",
  "supabase/migrations/20260920033321_native_ai_command_journal.sql",
  "supabase/migrations/20260920082522_native_routine_creation.sql",
  "supabase/migrations/20260920091316_native_ai_routine_creation.sql",
  "supabase/migrations/20260920093203_native_routine_editing.sql",
  "supabase/migrations/20260920100014_native_ai_routine_editing.sql",
  "supabase/migrations/20260920101012_native_routine_lifecycle.sql",
  "supabase/migrations/20260920103624_native_ai_routine_lifecycle.sql",
  "supabase/migrations/20260920141458_native_ai_chore_changes.sql",
];
