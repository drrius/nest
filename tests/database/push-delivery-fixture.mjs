import { fixture, id, json, as } from "./renewal-fixture.mjs";
export { id, json, as };
export function deliveryFixture(t) {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260922213246_native_renewal_reminder_storage.sql");
  if (f.db.sql("select to_regclass('public.nest_notification_preferences') is null") === "t")
    f.db.file("supabase/migrations/20260920072531_native_notification_preferences.sql");
  f.db.file("supabase/migrations/20260922221206_native_renewal_reminder_due.sql");
  f.db.file("supabase/migrations/20260922223732_native_push_registration.sql");
  f.db.file("supabase/migrations/20260922230403_native_push_logout.sql");
  // Synthetic minimal Auth session table: hosted schema/behavior still needs acceptance.
  f.db.sql(
    "create table auth.sessions(id uuid primary key,user_id uuid not null,not_after timestamptz)",
  );
  f.db.file("supabase/migrations/20260923002254_native_push_delivery_claims.sql");
  const date = f.db.sql("select (clock_timestamp() at time zone 'Europe/Zurich')::date");
  const receipt = f.record(f.save({ ...f.input, fields: { ...f.fields, renewalOn: date } }));
  const settings = { enabled: true, recipientIds: [id(1)], localTime: "00:00", daysBefore: 0 };
  f.db.sql(
    `insert into public.nest_renewal_reminders values('${id(10)}','${id(900)}','${id(950)}','${receipt.renewal.revision}','${id(2)}','renewal',${json(settings)})`,
  );
  f.db.sql(
    `insert into public.nest_notification_preferences(actor_id,household_id,revision,daily_summary_enabled,daily_summary_time,item_reminders_enabled) values('${id(1)}','${id(10)}',1,false,'09:00',true)`,
  );
  f.db.sql(`insert into auth.sessions values('${id(1700)}','${id(1)}',null)`);
  f.db.sql(
    as(
      1,
      `set request.jwt.claims='${JSON.stringify({ session_id: id(1700) })}'; select public.nest_save_push_device('${id(10)}',${json({ action: "register", operationId: id(1701), installationId: id(1702), expectedRevision: null, token: "ExponentPushToken[DeliveryFixture]" })})`,
    ),
  );
  f.db.sql(
    "select private.nest_materialize_renewal_reminders(statement_timestamp()-interval '1 day',statement_timestamp())",
  );
  const outbox = f.db.sql("select id from private.nest_renewal_reminder_outbox");
  const prepare = () =>
    f.db.sql(`select private.nest_prepare_push_delivery('${outbox}','${id(1702)}')`);
  const beginSql = (delivery) => `select private.nest_begin_push_delivery('${delivery}')`;
  const begin = (delivery) => {
    const value = f.db.sql(beginSql(delivery));
    return value ? JSON.parse(value) : null;
  };
  return { ...f, outbox, prepare, beginSql, begin };
}
