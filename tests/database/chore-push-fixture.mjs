import { fixture as summaryFixture, id, json } from "./summary-push-fixture.mjs";
export { id, json };
export function fixture(t) {
  const f = summaryFixture(t);
  for (const name of [
    "20260923033231_native_chore_reminder_storage",
    "20260923040649_native_chore_reminder_schedule",
    "20260923041151_native_chore_push_claims",
  ])
    f.db.file(`supabase/migrations/${name}.sql`);
  f.db
    .sql(`insert into public.areas(id,household_id,name,sort_order) values('${id(4000)}','${id(10)}','Home',0);
    insert into public.routines(id,household_id,title,area_id,assignment_policy,schedule_kind,schedule_rule)
      values('${id(4001)}','${id(10)}','Private chore title','${id(4000)}','shared','one_off',jsonb_build_object('kind','one_off','date',(clock_timestamp() at time zone 'Europe/Zurich')::date));
    insert into public.routine_occurrences(id,household_id,routine_id,due_date,original_due_date,status,role)
      values('${id(4002)}','${id(10)}','${id(4001)}',(clock_timestamp() at time zone 'Europe/Zurich')::date,(clock_timestamp() at time zone 'Europe/Zurich')::date,'open','current');
    insert into public.nest_chore_reminders(household_id,occurrence_id,revision,reviewed_item_revision,updated_by,settings)
      select '${id(10)}',o.id,'${id(4003)}',private.nest_chore_reminder_baseline(o,r),'${id(1)}',${json({ enabled: true, recipientIds: [id(1)], localTime: "00:00", daysBefore: 0 })}
      from public.routine_occurrences o join public.routines r on r.id=o.routine_id where o.id='${id(4002)}';
    select private.nest_materialize_chore_reminders(statement_timestamp()-interval '1 day',statement_timestamp());`);
  const choreOutbox = f.db.sql("select id from private.nest_chore_reminder_outbox");
  const prepare = () =>
    f.db.sql(`select private.nest_prepare_chore_push('${choreOutbox}','${id(1702)}')`);
  return { ...f, summaryPrepare: f.prepare, choreOutbox, prepare };
}
