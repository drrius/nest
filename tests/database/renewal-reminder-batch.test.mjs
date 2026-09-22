import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id } from "./renewal-fixture.mjs";
test("concurrent bounded outbox runs reach every identity once and cancel obsolete batches", async (t) => {
  const f = batchFixture(t);
  const materialize =
    "select private.nest_materialize_renewal_reminders('2028-03-01 00:00Z','2028-03-02 00:00Z')->>'inserted'";
  const first = await Promise.all([f.db.concurrent(materialize), f.db.concurrent(materialize)]);
  for (const value of first) assert.ok(Number(value.stdout) <= 500);
  assert.equal(
    f.db.sql(`select count(*) from public.nest_renewal_reminders s
      cross join private.nest_renewal_reminder_scans c
      where (s.household_id,s.renewal_id)<=(c.after_household,c.after_renewal)`),
    "500",
    "concurrent workers advance disjoint source pages",
  );
  for (let i = 0; i < 3; i++) assert.ok(Number(f.db.sql(materialize)) <= 500);
  assert.equal(f.db.sql("select count(*) from private.nest_renewal_reminder_outbox"), "1001");
  assert.equal(f.db.sql(materialize), "0");
  verifySparseCancellation(f, materialize);
  f.db.sql("update public.nest_notification_preferences set item_reminders_enabled=false");
  const cancel = "select private.nest_cancel_obsolete_renewal_reminders()->>'cancelled'";
  const cancelled = await Promise.all([f.db.concurrent(cancel), f.db.concurrent(cancel)]);
  for (const value of cancelled) assert.ok(Number(value.stdout) <= 500);
  assert.ok(Number(f.db.sql(cancel)) <= 500);
  assert.equal(
    f.db.sql("select count(*) from private.nest_renewal_reminder_outbox where state='cancelled'"),
    "1001",
  );
  assert.equal(f.db.sql(cancel), "0");
  for (const role of ["authenticated", "anon", "service_role"])
    assert.throws(() => f.db.sql(`set role ${role}; ${materialize}`), /permission denied/);
});

function verifySparseCancellation(f, materialize) {
  const target = f.db.sql(
    "select renewal_id from private.nest_renewal_reminder_outbox order by due_at desc,id desc limit 1",
  );
  f.db.sql(`update public.nest_renewals set removed=true where id='${target}'`);
  const cancel = "select private.nest_cancel_obsolete_renewal_reminders()->>'cancelled'";
  assert.equal(f.db.sql(cancel), "0", "first 500 current records advance without mutations");
  assert.equal(f.db.sql(cancel), "0", "second 500 current records advance without mutations");
  assert.equal(f.db.sql(cancel), "1", "the obsolete final record is reached on the next page");
  assert.equal(
    f.db.sql("select count(*) from private.nest_renewal_reminder_outbox where state='pending'"),
    "1000",
  );
  f.db.sql(`update public.nest_renewals set removed=false where id='${target}'`);
  for (let i = 0; i < 5; i++) f.db.sql(materialize);
  assert.equal(
    f.db.sql("select count(*) from private.nest_renewal_reminder_outbox where state='pending'"),
    "1001",
    "a later sweep revisits a restored item behind the cursor",
  );
}

function batchFixture(t, count = 1001) {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260922213246_native_renewal_reminder_storage.sql");
  if (f.db.sql("select to_regclass('public.nest_notification_preferences') is null") === "t")
    f.db.file("supabase/migrations/20260920072531_native_notification_preferences.sql");
  f.db.file("supabase/migrations/20260922221206_native_renewal_reminder_due.sql");
  f.db.sql(
    `insert into public.nest_notification_preferences(actor_id,household_id,revision,daily_summary_enabled,daily_summary_time,item_reminders_enabled) values('${id(1)}','${id(10)}',1,false,'09:00',true)`,
  );
  f.db.sql(`insert into public.nest_renewals(household_id,id,revision,title,renewal_on,notice_days)
    select '${id(10)}',gen_random_uuid(),gen_random_uuid(),'Fixture renewal','2028-03-01',0 from generate_series(1,${count})`);
  f.db
    .sql(`insert into public.nest_renewal_reminders select household_id,id,gen_random_uuid(),revision,'${id(1)}','renewal',
    jsonb_build_object('enabled',true,'recipientIds',jsonb_build_array('${id(1)}'::text),'localTime','09:00','daysBefore',0) from public.nest_renewals`);
  return f;
}

test("scan receipts distinguish zero-write pages from an exact-page wrap", (t) => {
  const f = batchFixture(t, 250);
  const scan = () =>
    JSON.parse(
      f.db.sql(
        "select private.nest_materialize_renewal_reminders('2028-03-01 00:00Z','2028-03-02 00:00Z')",
      ),
    );
  f.db.sql("update public.nest_notification_preferences set item_reminders_enabled=false");
  assert.deepEqual(scan(), { scanned: 250, inserted: 0, wrapped: false });
  assert.deepEqual(scan(), { scanned: 0, inserted: 0, wrapped: true });
  f.db.sql("update public.nest_notification_preferences set item_reminders_enabled=true");
  assert.deepEqual(scan(), { scanned: 250, inserted: 250, wrapped: false });
  assert.deepEqual(scan(), { scanned: 0, inserted: 0, wrapped: true });
  assert.deepEqual(scan(), { scanned: 250, inserted: 0, wrapped: false });
});
