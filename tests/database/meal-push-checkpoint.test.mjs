import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, json } from "./meal-push-fixture.mjs";
function setup(t) {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260923050126_native_meal_push_scan.sql");
  const read = () =>
    JSON.parse(f.db.sql("set role service_role; select public.nest_read_meal_push_checkpoint()"));
  const saveSql = (revision, after) =>
    `set role service_role; select public.nest_save_meal_push_checkpoint('${revision}',${json(after)})`;
  return { ...f, read, saveSql };
}
const cursor = { dueAt: "2026-09-23T00:00:00+00:00", outboxId: id(1), installationId: id(2) };
test("checkpoint revision fences concurrent writers and supports wraparound", async (t) => {
  const f = setup(t),
    before = f.read();
  assert.equal(before.after, null);
  const results = await Promise.allSettled([
    f.db.concurrent(f.saveSql(before.revision, cursor)),
    f.db.concurrent(f.saveSql(before.revision, null)),
  ]);
  assert.equal(results.filter((v) => v.status === "fulfilled").length, 1);
  const current = f.read();
  assert.notEqual(current.revision, before.revision);
  assert.throws(() => f.db.sql(f.saveSql(before.revision, cursor)), /Checkpoint advanced/);
  const reset = JSON.parse(f.db.sql(f.saveSql(current.revision, null)));
  assert.equal(reset.after, null);
  assert.notEqual(reset.revision, current.revision);
});
test("malformed cursor cannot advance progress and checkpoint state is private", (t) => {
  const f = setup(t),
    before = f.read();
  for (const after of [
    {},
    { ...cursor, dueAt: "infinity" },
    { ...cursor, installationId: null },
    { ...cursor, extra: true },
  ])
    assert.throws(() => f.db.sql(f.saveSql(before.revision, after)));
  assert.deepEqual(f.read(), before);
  for (const role of ["anon", "authenticated"])
    assert.throws(
      () => f.db.sql(`set role ${role}; select public.nest_read_meal_push_checkpoint()`),
      /permission denied/,
    );
  assert.throws(
    () => f.db.sql("set role service_role; select * from private.nest_meal_push_scan_checkpoint"),
    /permission denied/,
  );
});

test("server maintenance materializes fixed windows and cancels muted meals without releasing tokens", (t) => {
  const f = setup(t);
  f.db.sql(
    "delete from private.nest_meal_reminder_outbox; delete from private.nest_meal_reminder_scans",
  );
  const maintain = () =>
    JSON.parse(f.db.sql("set role service_role; select public.nest_maintain_meal_reminders()"));
  const first = maintain();
  assert.equal(first.version, 1);
  assert.equal(first.previous.inserted + first.current.inserted, 1);
  assert.equal(f.db.sql("select count(*) from private.nest_push_delivery_attempts"), "0");
  assert.equal(f.db.sql("select count(*) from private.nest_meal_reminder_scans"), "2");
  const second = maintain();
  assert.equal(second.previous.inserted + second.current.inserted, 0);
  f.db.sql("update public.nest_notification_preferences set item_reminders_enabled=false");
  assert.equal(maintain().obsolete.cancelled, 1);
  for (const role of ["anon", "authenticated"])
    assert.throws(
      () => f.db.sql(`set role ${role}; select public.nest_maintain_meal_reminders()`),
      /permission denied/,
    );
});
