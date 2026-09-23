import test from "node:test";
import assert from "node:assert/strict";
import * as Schema from "../../apps/api/node_modules/effect/dist/Schema.js";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const { DailySummarySnapshot } = await import(require.resolve("@nest/contracts/daily-summary"));
import { fixture as contentFixture, id } from "./daily-summary-content-fixture.mjs";
function fixture(t) {
  const f = contentFixture(t);
  f.db.file("supabase/migrations/20260923014222_native_daily_summary_schedule.sql");
  f.db.file("supabase/migrations/20260923015620_native_daily_summary_snapshot.sql");
  const today = f.db.sql("select (clock_timestamp() at time zone 'Europe/Zurich')::date");
  f.db.sql("update public.nest_notification_preferences set daily_summary_time='00:00'");
  const schedule = (date = today) =>
    f.db.sql(`select private.nest_schedule_daily_summary('${id(10)}','${id(1)}','${date}')`);
  const outbox = schedule();
  const sql = `select private.nest_start_daily_summary('${outbox}')`;
  const start = () => JSON.parse(f.db.sql(sql) || "null");
  return { ...f, today, schedule, outbox, sql, start };
}
test("concurrent starts freeze one summary and exact retries recover its unchanged content", async (t) => {
  const f = fixture(t);
  f.chore(4100, { date: f.today });
  const attempts = await Promise.all([f.db.concurrent(f.sql), f.db.concurrent(f.sql)]);
  const first = Schema.decodeUnknownSync(DailySummarySnapshot)(JSON.parse(attempts[0].stdout));
  assert.deepEqual(JSON.parse(attempts[1].stdout), first);
  assert.equal(first.summary.choresDue.count, 1);
  f.db.sql(
    `update public.routine_occurrences set status='completed',role=null,closed_at=now() where id='${id(5100)}'`,
  );
  assert.deepEqual(f.start(), first);
  assert.equal(f.schedule(), "");
  assert.equal(f.db.sql("select count(*) from private.nest_daily_summary_snapshots"), "1");
  assert.throws(
    () => f.db.sql("delete from private.nest_daily_summary_snapshots"),
    /immutable|append.only|cannot/i,
  );
});
test("snapshot claim rechecks consent, revision, due time and day", (t) => {
  const f = fixture(t);
  f.db.sql(
    "update public.nest_notification_preferences set daily_summary_enabled=false,revision=2",
  );
  assert.equal(f.start(), null);
  f.db.sql("update public.nest_notification_preferences set daily_summary_enabled=true,revision=3");
  assert.equal(f.start(), null);
  f.schedule();
  f.db.sql(
    "update private.nest_daily_summary_outbox set due_at=clock_timestamp()+interval '1 hour'",
  );
  assert.equal(f.start(), null);
  f.schedule();
  const yesterday = f.db.sql(
    "select ((clock_timestamp() at time zone 'Europe/Zurich')::date-1)::text",
  );
  const old = f.schedule(yesterday);
  assert.equal(f.db.sql(`select private.nest_start_daily_summary('${old}')`), "");
  assert.ok(f.start());
  f.db.sql("update public.nest_notification_preferences set daily_summary_enabled=false");
  assert.equal(f.start(), null);
});
test("snapshot creation and start state roll back together and remain inaccessible", (t) => {
  const f = fixture(t);
  assert.throws(() => f.db.sql(`begin; ${f.sql}; select 1/0; commit`), /division by zero/);
  assert.equal(f.db.sql("select count(*) from private.nest_daily_summary_snapshots"), "0");
  assert.equal(f.db.sql("select state from private.nest_daily_summary_outbox"), "pending");
  for (const role of ["anon", "authenticated", "service_role"])
    assert.throws(() => f.db.sql(`set role ${role}; ${f.sql}`), /permission denied/);
});
