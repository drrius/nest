import test from "node:test";
import assert from "node:assert/strict";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture(t) {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  db.file("tests/database/conversation-fixture.sql");
  for (const file of [
    "20260920072531_native_notification_preferences.sql",
    "20260923014222_native_daily_summary_schedule.sql",
    "20260923014646_native_daily_summary_scan.sql",
  ])
    db.file(`supabase/migrations/${file}`);
  const sql = "select private.nest_materialize_daily_summaries('2026-09-23')";
  const scan = () => JSON.parse(db.sql(sql));
  return { db, sql, scan };
}
test("bounded daily scan advances through unconsented members and resumes beyond an empty page", (t) => {
  const f = fixture(t);
  f.db.sql(`insert into public.nest_notification_preferences select
    ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'${id(10)}',1,true,'08:00',false,now() from generate_series(1,250) n;
    insert into public.nest_notification_preferences values('${id(1)}','${id(10)}',1,true,'08:00',false,now())`);
  assert.deepEqual(f.scan(), { version: 1, scanned: 250, scheduled: 0, wrapped: false });
  assert.deepEqual(f.scan(), { version: 1, scanned: 1, scheduled: 1, wrapped: true });
  const identity = f.db.sql("select id from private.nest_daily_summary_outbox");
  f.scan();
  f.scan();
  assert.equal(f.db.sql("select id from private.nest_daily_summary_outbox"), identity);
  f.db.sql(
    "update public.nest_notification_preferences set daily_summary_enabled=false,revision=2",
  );
  f.scan();
  assert.equal(f.scan().scheduled, 0);
  assert.equal(f.db.sql("select state from private.nest_daily_summary_outbox"), "cancelled");
});
test("daily scan checkpoint and scheduled rows roll back together and stay private", (t) => {
  const f = fixture(t);
  f.db.sql(
    `insert into public.nest_notification_preferences values('${id(1)}','${id(10)}',1,true,'08:00',false,now())`,
  );
  assert.throws(() => f.db.sql(`begin; ${f.sql}; select 1/0; commit`), /division by zero/);
  assert.equal(f.db.sql("select count(*) from private.nest_daily_summary_scans"), "0");
  assert.equal(f.db.sql("select count(*) from private.nest_daily_summary_outbox"), "0");
  assert.equal(f.scan().scheduled, 1);
  for (const role of ["anon", "authenticated", "service_role"])
    assert.throws(() => f.db.sql(`set role ${role}; ${f.sql}`), /permission denied/);
  assert.throws(
    () => f.db.sql("select private.nest_materialize_daily_summaries('infinity')"),
    /Invalid summary date/,
  );
});

test("concurrent scans preserve one day identity and checkpoint", async (t) => {
  const f = fixture(t);
  f.db.sql(
    `insert into public.nest_notification_preferences values('${id(1)}','${id(10)}',1,true,'08:00',false,now())`,
  );
  const results = await Promise.all([f.db.concurrent(f.sql), f.db.concurrent(f.sql)]);
  for (const result of results) assert.equal(JSON.parse(result.stdout).scheduled, 1);
  assert.equal(f.db.sql("select count(*) from private.nest_daily_summary_outbox"), "1");
  assert.equal(f.db.sql("select count(*) from private.nest_daily_summary_scans"), "1");
});
