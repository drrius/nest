import { readFileSync } from "node:fs";
import { fixture as mealFixture, id, json, as } from "./meal-reminder-fixture.mjs";
export { id, json, as } from "./meal-reminder-fixture.mjs";
export function fixture(t) {
  const { db } = mealFixture(t);
  // Reuse the audited grocery shape without duplicating Supabase tenancy infrastructure.
  const grocery = readFileSync("tests/database/grocery-fixture.sql", "utf8");
  db.sql(grocery.slice(grocery.indexOf("create table public.grocery_items")));
  const edit = readFileSync("tests/database/grocery-edit-fixture.sql", "utf8");
  db.sql(edit.slice(edit.indexOf("alter table public.grocery_items")));
  db.file("supabase/migrations/20260919214311_native_grocery_check_receipts.sql");
  db.file("supabase/migrations/20260920002735_native_grocery_commands.sql");
  db.file("supabase/migrations/20260923051033_native_dated_reminder_settings.sql");
  db.file("supabase/migrations/20260923051148_native_grocery_reminder_storage.sql");
  db.sql(
    `insert into public.grocery_items(id,household_id,name) values('${id(500)}','${id(10)}','Milk')`,
  );
  const input = {
    itemId: id(500),
    expectedItemVersion: "1",
    expectedRevision: null,
    settings: {
      enabled: true,
      recipientIds: [id(1), id(2)],
      localDate: "2026-10-01",
      localTime: "09:00",
    },
  };
  const saveSql = (value = input, operation = id(2000)) =>
    `select public.nest_save_grocery_reminder('${id(10)}','${operation}',${json(value)})`;
  const save = (value = input, operation = id(2000), actor = id(1)) =>
    JSON.parse(db.sql(as(saveSql(value, operation), actor)));
  const read = (actor = id(1)) =>
    JSON.parse(
      db.sql(as(`select public.nest_read_grocery_reminder('${id(10)}','${id(500)}')`, actor)),
    );
  const recover = (operation = id(2000), cancel = false, actor = id(1)) =>
    JSON.parse(
      db.sql(
        as(
          `select public.nest_${cancel ? "cancel" : "read"}_grocery_reminder_operation('${id(10)}','${operation}')`,
          actor,
        ),
      ),
    );
  return { db, input, saveSql, save, read, recover };
}
