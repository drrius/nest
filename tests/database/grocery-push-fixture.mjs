import { readFileSync } from "node:fs";
import { fixture as mealFixture, id, json } from "./meal-push-fixture.mjs";
export { id, json };
export function fixture(t) {
  const f = mealFixture(t);
  const tables = readFileSync("tests/database/ai-grocery-reminder-tables.sql", "utf8");
  const categoryStart = tables.indexOf("-- Audited additions");
  const groceryAlter = tables.indexOf("alter table public.grocery_items");
  f.db.sql(tables.slice(0, categoryStart));
  if (f.db.sql("select to_regclass('public.grocery_categories') is null") === "t")
    f.db.sql(tables.slice(categoryStart, groceryAlter));
  f.db.sql(tables.slice(groceryAlter));
  f.db.file("supabase/migrations/20260919214311_native_grocery_check_receipts.sql");
  for (const name of [
    "20260923051033_native_dated_reminder_settings",
    "20260923051148_native_grocery_reminder_storage",
    "20260923053557_native_grocery_reminder_schedule",
    "20260923053844_native_grocery_push_claims",
  ])
    f.db.file(`supabase/migrations/${name}.sql`);
  f.db
    .sql(`insert into public.grocery_items(id,household_id,name) values('${id(6001)}','${id(10)}','Private grocery');
    insert into public.nest_grocery_reminders(household_id,item_id,revision,reviewed_item_version,updated_by,settings)
    select '${id(10)}',g.id,'${id(6002)}',g.native_version,'${id(1)}',
      jsonb_build_object('enabled',true,'recipientIds',jsonb_build_array('${id(1)}'::uuid),'localTime','00:00','localDate',to_char(clock_timestamp() at time zone 'Europe/Zurich','YYYY-MM-DD'))
    from public.grocery_items g where g.id='${id(6001)}';
    select private.nest_materialize_grocery_reminders(statement_timestamp()-interval '1 day',statement_timestamp());`);
  const groceryOutbox = f.db.sql("select id from private.nest_grocery_reminder_outbox");
  const prepare = () =>
    f.db.sql(`select private.nest_prepare_grocery_push('${groceryOutbox}','${id(1702)}')`);
  return { ...f, mealPrepare: f.prepare, groceryOutbox, prepare };
}
