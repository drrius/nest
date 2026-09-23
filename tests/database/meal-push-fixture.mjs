import { fixture as choreFixture, id, json } from "./chore-push-fixture.mjs";
export { id, json };
export function fixture(t) {
  const f = choreFixture(t);
  if (f.db.sql("select to_regclass('public.meal_plan_entries') is null") === "t")
    throw new Error("Expected audited meal tables in push fixture");
  for (const name of [
    "20260923042902_native_meal_reminder_storage",
    "20260923045116_native_meal_reminder_schedule",
    "20260923045445_native_meal_push_claims",
  ])
    f.db.file(`supabase/migrations/${name}.sql`);
  f.db.sql(`insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot)
    values('${id(5001)}','${id(10)}',(clock_timestamp() at time zone 'Europe/Zurich')::date,'dinner','Private meal title');
    insert into public.nest_meal_reminders(household_id,entry_id,revision,reviewed_item_revision,updated_by,settings)
    select '${id(10)}',m.id,'${id(5002)}',private.nest_meal_reminder_baseline(m),'${id(1)}',${json({ enabled: true, recipientIds: [id(1)], localTime: "00:00", daysBefore: 0 })}
    from public.meal_plan_entries m where m.id='${id(5001)}';
    select private.nest_materialize_meal_reminders(statement_timestamp()-interval '1 day',statement_timestamp());`);
  const mealOutbox = f.db.sql("select id from private.nest_meal_reminder_outbox");
  const prepare = () =>
    f.db.sql(`select private.nest_prepare_meal_push('${mealOutbox}','${id(1702)}')`);
  return { ...f, chorePrepare: f.prepare, mealOutbox, prepare };
}
