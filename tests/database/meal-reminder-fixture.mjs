import { readFileSync } from "node:fs";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { mealWeekFiles } from "./meal-week-files.mjs";
export { id, json, as } from "./chore-reminder-fixture.mjs";
import { id, json, as } from "./chore-reminder-fixture.mjs";
export const migration = "supabase/migrations/20260923042902_native_meal_reminder_storage.sql";
export function fixture(t) {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  for (const file of mealWeekFiles) db.file(file);
  for (const [name, end] of [
    ["20260921120810_native_ai_expense_proposal", "create function private.nest_canonical_expense"],
    [
      "20260922213246_native_renewal_reminder_storage",
      "create table public.nest_renewal_reminders",
    ],
  ]) {
    const source = readFileSync(`supabase/migrations/${name}.sql`, "utf8");
    db.sql(source.slice(0, source.indexOf(end)));
  }
  db.file(migration);
  const read = (entry = id(100), actor = id(1)) =>
    JSON.parse(db.sql(as(`select public.nest_read_meal_reminder('${id(10)}','${entry}')`, actor)));
  const input = {
    entryId: id(100),
    expectedItemRevision: read().itemRevision,
    expectedRevision: null,
    settings: { enabled: true, recipientIds: [id(1), id(2)], localTime: "09:00", daysBefore: 0 },
  };
  const saveSql = (value = input, operation = id(2000)) =>
    `select public.nest_save_meal_reminder('${id(10)}','${operation}',${json(value)})`;
  const save = (value = input, operation = id(2000), actor = id(1)) =>
    JSON.parse(db.sql(as(saveSql(value, operation), actor)));
  const recover = (operation = id(2000), cancel = false, actor = id(1)) =>
    JSON.parse(
      db.sql(
        as(
          `select public.nest_${cancel ? "cancel" : "read"}_meal_reminder_operation('${id(10)}','${operation}')`,
          actor,
        ),
      ),
    );
  return { db, read, input, saveSql, save, recover };
}
