import { readFileSync } from "node:fs";
import { fixture as renewal, id } from "./renewal-fixture.mjs";
export { id };
export function fixture(t) {
  const f = renewal(t);
  f.db.file("tests/database/legacy-routines/schedule-validation.sql");
  // Audited legacy table definitions; the money fixture already owns activity_events.
  const tables = readFileSync("tests/database/legacy-routines/tables.sql", "utf8");
  f.db.sql(tables.slice(0, tables.indexOf("create table public.activity_events")));
  f.db.file("tests/database/legacy-routine-edits/edit-tables.sql");
  // These audited tables have RLS enabled by the legacy baseline.
  for (const table of [
    "areas",
    "pets",
    "routines",
    "routine_occurrences",
    "routine_completions",
    "meal_definitions",
    "meal_plan_entries",
  ])
    f.db.sql(`alter table public.${table} enable row level security`);
  f.db.file("supabase/migrations/20260920143047_native_chore_transfer_storage.sql");
  f.db.file("supabase/migrations/20260920072531_native_notification_preferences.sql");
  f.db.file("supabase/migrations/20260923015151_native_daily_summary_content.sql");
  f.db
    .sql(`insert into public.nest_notification_preferences values('${id(1)}','${id(10)}',1,true,'08:00',false,now()),('${id(2)}','${id(10)}',1,true,'08:00',false,now());
    insert into public.areas(id,household_id,name,sort_order) values('${id(4000)}','${id(10)}','Home',0)`);
  const chore = (
    n,
    { date = "2028-03-01", actor = null, accepted = null, role = "current" } = {},
  ) => {
    f.db
      .sql(`insert into public.routines(id,household_id,title,area_id,assignment_policy,schedule_kind,schedule_rule)
      values('${id(n)}','${id(10)}','Private household chore','${id(4000)}','shared','one_off','{"kind":"one_off","date":"2028-03-01"}');
      insert into public.routine_occurrences(id,household_id,routine_id,due_date,original_due_date,planned_assignee_id,nest_accepted_assignee_id,status,role)
      values('${id(n + 1000)}','${id(10)}','${id(n)}','${date}','${date}',${actor ? `'${id(actor)}'` : "null"},${accepted ? `'${id(accepted)}'` : "null"},'open','${role}')`);
  };
  const query = (actor = 1) =>
    `select private.nest_daily_summary_content('${id(10)}','${id(actor)}','2028-03-01')`;
  return { ...f, chore, query, content: (actor) => JSON.parse(f.db.sql(query(actor)) || "null") };
}
