import { fixture, as, id, json } from "./meal-reminder-fixture.mjs";
export { as, id, json };
export const migration = "supabase/migrations/20260923045116_native_meal_reminder_schedule.sql";
export function setup(t, date = "2028-03-26") {
  const f = { ...fixture(t), entryId: id(100) };
  f.db.file("supabase/migrations/20260920072531_native_notification_preferences.sql");
  f.db.file(migration);
  f.db.sql(`update public.meal_plan_entries set date='${date}' where id='${f.entryId}'`);
  const input = {
    ...f.input,
    expectedItemRevision: f.read().itemRevision,
    settings: { ...f.input.settings, localTime: "02:30" },
  };
  f.save(input);
  f.db
    .sql(`insert into public.nest_notification_preferences(actor_id,household_id,revision,daily_summary_enabled,daily_summary_time,item_reminders_enabled)
    values('${id(1)}','${id(10)}',1,false,'09:00',true),('${id(2)}','${id(10)}',1,false,'09:00',true)`);
  const window = `'${date} 00:00Z',('${date}'::date+1)::timestamptz`;
  const materializeSql = `select private.nest_materialize_meal_reminders(${window})`;
  const materialize = () => JSON.parse(f.db.sql(materializeSql));
  const cancel = () => JSON.parse(f.db.sql("select private.nest_cancel_obsolete_meal_reminders()"));
  const due = () =>
    f.db.sql(
      "select to_char(private.nest_meal_reminder_due(o,s) at time zone 'UTC','YYYY-MM-DD HH24:MI') from public.nest_meal_reminders s join public.meal_plan_entries o on o.id=s.entry_id",
    );
  return { ...f, input, window, materializeSql, materialize, cancel, due };
}
