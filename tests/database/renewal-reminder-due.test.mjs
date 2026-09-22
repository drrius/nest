import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, json } from "./renewal-fixture.mjs";
test("reminder due time uses Zurich DST and invalidates changed, removed or disabled items", (t) => {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260922213246_native_renewal_reminder_storage.sql");
  if (f.db.sql("select to_regclass('public.nest_notification_preferences') is null") === "t")
    f.db.file("supabase/migrations/20260920072531_native_notification_preferences.sql");
  f.db.file("supabase/migrations/20260922221206_native_renewal_reminder_due.sql");
  const receipt = f.record(f.save());
  const settings = { enabled: true, recipientIds: [id(1)], localTime: "02:30", daysBefore: 0 };
  f.db.sql(
    `insert into public.nest_renewal_reminders values('${id(10)}','${id(900)}','${id(950)}','${receipt.renewal.revision}','${id(1)}','renewal',${json(settings)})`,
  );
  f.db.sql(
    `insert into public.nest_notification_preferences(actor_id,household_id,revision,daily_summary_enabled,daily_summary_time,item_reminders_enabled) values('${id(1)}','${id(10)}',1,false,'09:00',true)`,
  );
  const candidates = () =>
    f.db.sql(
      "select count(*) from private.nest_renewal_reminder_candidates('2028-03-01 00:00Z','2028-03-02 00:00Z')",
    );
  assert.equal(candidates(), "1");
  const materialize = () =>
    f.db.sql(
      "select private.nest_materialize_renewal_reminders('2028-03-01 00:00Z','2028-03-02 00:00Z')",
    );
  assert.equal(materialize(), "1");
  assert.equal(materialize(), "0");
  assert.equal(
    f.db.sql(
      "select private.nest_renewal_reminder_current(o) from private.nest_renewal_reminder_outbox o",
    ),
    "t",
  );

  f.db.sql("update public.nest_notification_preferences set item_reminders_enabled=false");
  assert.equal(candidates(), "0");
  assert.equal(f.db.sql("select private.nest_cancel_obsolete_renewal_reminders()"), "1");
  assert.equal(f.db.sql("select state from private.nest_renewal_reminder_outbox"), "cancelled");
  assert.equal(f.db.sql("select private.nest_cancel_obsolete_renewal_reminders()"), "0");

  f.db.sql("delete from public.nest_notification_preferences");
  assert.equal(candidates(), "0");
  assert.throws(
    () =>
      f.db.sql("select * from private.nest_renewal_reminder_candidates('2028-03-01','2028-03-03')"),
    /Invalid reminder window/,
  );
  const due = () =>
    f.db.sql(
      "select to_char(private.nest_renewal_reminder_due(r,s) at time zone 'UTC','YYYY-MM-DD HH24:MI') from public.nest_renewals r join public.nest_renewal_reminders s on s.household_id=r.household_id and s.renewal_id=r.id",
    );
  f.db.sql("update public.nest_renewals set renewal_on='2028-03-26'");
  assert.equal(due(), "2028-03-26 01:30");
  f.db.sql("update public.nest_renewals set renewal_on='2028-10-29'");
  assert.equal(due(), "2028-10-29 01:30");
  f.db.sql("update public.nest_renewal_reminders set anchor='cancellation'");
  assert.equal(due(), "2028-10-28 00:30");
  f.db.sql("update public.nest_renewals set removed=true");
  assert.equal(due(), "");
  f.db.sql("update public.nest_renewals set removed=false,revision=gen_random_uuid()");
  assert.equal(due(), "");
  f.db.sql(
    "update public.nest_renewal_reminders set reviewed_renewal_revision=(select revision from public.nest_renewals),delivery=jsonb_set(delivery,'{enabled}','false')",
  );
  assert.equal(due(), "");
});
