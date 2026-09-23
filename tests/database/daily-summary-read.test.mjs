import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id } from "./daily-summary-content-fixture.mjs";
test("saved daily summaries remain owner-private after future delivery is muted", (t) => {
  const f = fixture(t);
  for (const name of [
    "20260923014222_native_daily_summary_schedule.sql",
    "20260923015620_native_daily_summary_snapshot.sql",
    "20260923015956_native_daily_summary_read.sql",
  ])
    f.db.file(`supabase/migrations/${name}`);
  f.db.sql("update public.nest_notification_preferences set daily_summary_time='00:00'");
  const summaryId = f.db.sql(
    `select private.nest_schedule_daily_summary('${id(10)}','${id(1)}',(clock_timestamp() at time zone 'Europe/Zurich')::date)`,
  );
  const expected = JSON.parse(f.db.sql(`select private.nest_start_daily_summary('${summaryId}')`));
  const query = (home = 10, summary = summaryId) =>
    `select public.nest_read_daily_summary('${id(home)}','${summary}')`;
  const read = (actor, home, summary) =>
    f.db.sql(
      `set role authenticated; set request.jwt.claim.sub='${id(actor)}'; ${query(home, summary)}`,
    );
  assert.deepEqual(JSON.parse(read(1)), expected);
  assert.throws(() => read(2), /Summary unavailable/);
  assert.throws(() => read(3), /Not authorized/);
  assert.throws(() => read(1, 20), /Not authorized/);
  assert.throws(() => read(1, 10, id(9999)), /Summary unavailable/);
  assert.throws(() => f.db.sql(`set role anon; ${query()}`), /permission denied/);
  assert.throws(
    () => f.db.sql("set role authenticated; select * from private.nest_daily_summary_snapshots"),
    /permission denied/,
  );
  f.db.sql("update public.nest_notification_preferences set daily_summary_enabled=false");
  assert.deepEqual(JSON.parse(read(1)), expected);
});
