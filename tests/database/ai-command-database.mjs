import { after } from "node:test";
import { aiCommandFiles } from "./ai-command-files.mjs";
import { startFixturePostgres } from "./fixture-postgres.mjs";

export function aiCommandDatabase() {
  const db = startFixturePostgres();
  after(() => db.stop());
  for (const file of aiCommandFiles) db.file(file);
  db.file("supabase/migrations/20260926092224_native_grocery_nonretryable_conflicts.sql");
  db.file("supabase/migrations/20260926092623_native_grocery_check_nonretryable_conflict.sql");
  return db;
}
