import { fixture, as, id, json } from "./recurring-reminder-fixture.mjs";
export { as, id, json };
export const migration =
  "supabase/migrations/20260923062003_native_recurring_reminder_schedule.sql";
export function setup(t, date = "2028-03-26") {
  const f = fixture(t);
  f.ruleId = f.input.ruleId;
  f.db.sql(
    `update private.nest_recurring_execution set next_due_on='${date}'::date where rule_id='${f.ruleId}'`,
  );
  f.db.file("supabase/migrations/20260920072531_native_notification_preferences.sql");
  f.db.file(migration);
  const input = {
    ...f.input,
    expectedDueOn: date,
    settings: { ...f.input.settings, localTime: "02:30", daysBefore: 0 },
  };
  f.save(input);
  f.db
    .sql(`insert into public.nest_notification_preferences(actor_id,household_id,revision,daily_summary_enabled,daily_summary_time,item_reminders_enabled)
    values('${id(1)}','${id(10)}',1,false,'09:00',true),('${id(2)}','${id(10)}',1,false,'09:00',true)`);
  const window = `'${date} 00:00Z',('${date}'::date+1)::timestamptz`;
  const materializeSql = `select private.nest_materialize_recurring_reminders(${window})`;
  const materialize = () => JSON.parse(f.db.sql(materializeSql));
  const cancel = () =>
    JSON.parse(f.db.sql("select private.nest_cancel_obsolete_recurring_reminders()"));
  const due = () =>
    f.db.sql(
      "select to_char(private.nest_recurring_reminder_due(o,s,e) at time zone 'UTC','YYYY-MM-DD HH24:MI') from public.nest_recurring_reminders s join public.nest_recurring_rules o on o.id=s.rule_id join private.nest_recurring_execution e on e.rule_id=o.id and e.household_id=o.household_id",
    );
  return { ...f, input, window, materializeSql, materialize, cancel, due };
}
