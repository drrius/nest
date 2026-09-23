import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id } from "./meal-push-fixture.mjs";
function setup(t) {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260923050126_native_meal_push_scan.sql");
  const scan = (after) =>
    JSON.parse(
      f.db.sql(
        after
          ? `select public.nest_scan_meal_push_deliveries('${after.dueAt}','${after.outboxId}','${after.installationId}')`
          : "select public.nest_scan_meal_push_deliveries()",
      ),
    );
  return { ...f, scan };
}
test("meal scan returns token-free prepared identities and begin rechecks changed authorization", (t) => {
  const f = setup(t);
  const page = f.scan();
  assert.equal(page.scanned, 1);
  assert.equal(page.complete, true);
  assert.equal(page.after, null);
  assert.equal(page.deliveries.length, 1);
  assert.ok(!JSON.stringify(page).includes("ExponentPushToken"));
  assert.deepEqual(f.scan(), page);
  f.db.sql("update public.nest_notification_preferences set item_reminders_enabled=false");
  assert.equal(f.begin(page.deliveries[0]), null);
  assert.deepEqual(f.scan().deliveries, []);
});
test("one hundred invalid sessions cannot starve the next page of valid devices", (t) => {
  const f = setup(t);
  f.db.sql(`delete from private.nest_push_devices;
    insert into private.nest_push_devices(installation_id,actor_id,household_id,revision,token,session_id)
    select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${id(1)}','${id(10)}',gen_random_uuid(),
      'ExponentPushToken[scan'||n||']',case when n<=100 then null else '${id(1700)}'::uuid end
    from generate_series(1,105) n`);
  const first = f.scan();
  assert.equal(first.scanned, 100);
  assert.equal(first.complete, false);
  assert.deepEqual(first.deliveries, []);
  const second = f.scan(first.after);
  assert.equal(second.scanned, 5);
  assert.equal(second.deliveries.length, 5);
  assert.equal(second.complete, true);
  for (const delivery of second.deliveries) assert.ok(f.begin(delivery));
  assert.deepEqual(f.scan(first.after).deliveries, []);
});
test("scan enforces complete cursors and server-only access", (t) => {
  const f = setup(t);
  assert.throws(
    () => f.db.sql(`select public.nest_scan_meal_push_deliveries(null,'${f.mealOutbox}',null)`),
    /Invalid push scan cursor/,
  );
  assert.throws(
    () =>
      f.db.sql(
        `select public.nest_scan_meal_push_deliveries('infinity','${f.mealOutbox}','${id(1702)}')`,
      ),
    /Invalid push scan cursor/,
  );
  for (const role of ["anon", "authenticated"])
    assert.throws(
      () => f.db.sql(`set role ${role}; select public.nest_scan_meal_push_deliveries()`),
      /permission denied/,
    );
  assert.equal(
    JSON.parse(f.db.sql("set role service_role; select public.nest_scan_meal_push_deliveries()"))
      .scanned,
    1,
  );
});
test("meal scan excludes cancelled or expired rows and rolls preparation back atomically", (t) => {
  const f = setup(t);
  f.db.sql("begin; select public.nest_scan_meal_push_deliveries(); rollback");
  assert.equal(f.db.sql("select count(*) from private.nest_push_deliveries"), "0");
  f.db.sql(
    "update private.nest_meal_reminder_outbox set due_at=clock_timestamp()-interval '2 days'",
  );
  assert.equal(f.scan().scanned, 0);
  f.db.sql(
    "update private.nest_meal_reminder_outbox set due_at=clock_timestamp(),state='cancelled'",
  );
  assert.equal(f.scan().scanned, 0);
});
