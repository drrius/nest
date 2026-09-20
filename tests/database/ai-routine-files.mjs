// Actual audited routine creation engine plus private conversation/turn journal.
// Unrelated dispatcher branches are not exercised by this focused fixture.
export const aiRoutineFiles = [
  "tests/database/routine-creation-fixture.sql",
  "supabase/migrations/20260919220034_native_private_conversations.sql",
  "supabase/migrations/20260920022841_native_ai_turn_ownership.sql",
  "supabase/migrations/20260920033321_native_ai_command_journal.sql",
  "supabase/migrations/20260920082522_native_routine_creation.sql",
  "supabase/migrations/20260920091316_native_ai_routine_creation.sql",
];
