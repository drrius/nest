import { choreChangeFiles } from "./chore-change-files.mjs";
export const choreTransferFiles = [
  ...choreChangeFiles,
  "supabase/migrations/20260920143047_native_chore_transfer_storage.sql",
  "supabase/migrations/20260920143104_native_chore_transfer_commands.sql",
];
