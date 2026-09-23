import { fixture, as, id, json } from "./chore-reminder-fixture.mjs";
export { as, id, json };
export const migration = "supabase/migrations/20260923040649_native_chore_reminder_schedule.sql";
export function setup(t, date = "2028-03-26") {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260920072531_native_notification_preferences.sql");
  f.db.file(migration);
  f.db.sql(`update public.routine_occurrences set due_date='${date}' where id='${f.occurrenceId}'`);
  const input = {
    ...f.input,
    expectedItemRevision: f.read().itemRevision,
    settings: { ...f.settings, localTime: "02:30" },
  };
  f.save(input);
  f.db
    .sql(`insert into public.nest_notification_preferences(actor_id,household_id,revision,daily_summary_enabled,daily_summary_time,item_reminders_enabled)
    values('${id(1)}','${id(10)}',1,false,'09:00',true),('${id(2)}','${id(10)}',1,false,'09:00',true)`);
  const window = `'${date} 00:00Z',('${date}'::date+1)::timestamptz`;
  const materializeSql = `select private.nest_materialize_chore_reminders(${window})`;
  const materialize = () => JSON.parse(f.db.sql(materializeSql));
  const cancel = () =>
    JSON.parse(f.db.sql("select private.nest_cancel_obsolete_chore_reminders()"));
  const due = () =>
    f.db.sql(
      "select to_char(private.nest_chore_reminder_due(o,r,s) at time zone 'UTC','YYYY-MM-DD HH24:MI') from public.nest_chore_reminders s join public.routine_occurrences o on o.id=s.occurrence_id join public.routines r on r.id=o.routine_id",
    );
  return { ...f, input, window, materializeSql, materialize, cancel, due };
}
