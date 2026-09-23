import { fixture, as, id, json } from "./grocery-reminder-fixture.mjs";
export { as, id, json };
export const migration = "supabase/migrations/20260923053557_native_grocery_reminder_schedule.sql";
export function setup(t, date = "2028-03-26") {
  const f = { ...fixture(t), itemId: id(500) };
  f.db.file("supabase/migrations/20260920072531_native_notification_preferences.sql");
  f.db.file(migration);
  const input = {
    ...f.input,
    settings: { ...f.input.settings, localTime: "02:30", localDate: date },
  };
  f.save(input);
  f.db
    .sql(`insert into public.nest_notification_preferences(actor_id,household_id,revision,daily_summary_enabled,daily_summary_time,item_reminders_enabled)
    values('${id(1)}','${id(10)}',1,false,'09:00',true),('${id(2)}','${id(10)}',1,false,'09:00',true)`);
  const window = `'${date} 00:00Z',('${date}'::date+1)::timestamptz`;
  const materializeSql = `select private.nest_materialize_grocery_reminders(${window})`;
  const materialize = () => JSON.parse(f.db.sql(materializeSql));
  const cancel = () =>
    JSON.parse(f.db.sql("select private.nest_cancel_obsolete_grocery_reminders()"));
  const due = () =>
    f.db.sql(
      "select to_char(private.nest_grocery_reminder_due(o,s) at time zone 'UTC','YYYY-MM-DD HH24:MI') from public.nest_grocery_reminders s join public.grocery_items o on o.id=s.item_id",
    );
  return { ...f, input, window, materializeSql, materialize, cancel, due };
}
