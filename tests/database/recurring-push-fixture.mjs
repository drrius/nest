import { fixture as grocery, id, json } from "./grocery-push-fixture.mjs";
export { id, json };
export function fixture(t) {
  const f = grocery(t);
  for (const name of [
    "20260923055905_native_recurring_reminder_storage",
    "20260923062003_native_recurring_reminder_schedule",
    "20260923062428_native_recurring_push_claims",
  ])
    f.db.file(`supabase/migrations/${name}.sql`);
  f.db
    .sql(`insert into public.nest_recurring_reminders(household_id,rule_id,revision,reviewed_rule_revision,reviewed_due_on,updated_by,settings)
    select r.household_id,r.id,'${id(7002)}',r.revision,e.next_due_on,'${id(1)}',
    ${json({ enabled: true, recipientIds: [id(1)], localTime: "00:00", daysBefore: 0 })}
    from public.nest_recurring_rules r join private.nest_recurring_execution e on e.household_id=r.household_id and e.rule_id=r.id where r.id='${id(300)}';
    select private.nest_materialize_recurring_reminders(statement_timestamp()-interval '1 day',statement_timestamp());`);
  const recurringOutbox = f.db.sql("select id from private.nest_recurring_reminder_outbox");
  const prepare = () =>
    f.db.sql(`select private.nest_prepare_recurring_push('${recurringOutbox}','${id(1702)}')`);
  return { ...f, groceryPrepare: f.prepare, recurringOutbox, prepare };
}
