import test from "node:test";
import assert from "node:assert/strict";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture(t) {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  db.file("tests/database/conversation-fixture.sql");
  db.file("supabase/migrations/20260920072531_native_notification_preferences.sql");
  db.file("supabase/migrations/20260923014222_native_daily_summary_schedule.sql");
  const call = (date, actor = 1) =>
    `select private.nest_schedule_daily_summary('${id(10)}','${id(actor)}','${date}')`;
  const schedule = (date, actor) => db.sql(call(date, actor));
  const enable = () =>
    db.sql(
      `insert into public.nest_notification_preferences values('${id(1)}','${id(10)}',1,true,'02:30',false,now())`,
    );
  return { db, call, schedule, enable };
}
test("daily summaries have one Zurich day identity through DST and preference changes", (t) => {
  const f = fixture(t);
  f.enable();
  const first = f.schedule("2026-03-29");
  assert.equal(f.schedule("2026-03-29"), first);
  assert.equal(
    f.db.sql("select due_at at time zone 'UTC' from private.nest_daily_summary_outbox"),
    "2026-03-29 01:30:00",
  );
  f.schedule("2026-10-25");
  assert.equal(
    f.db.sql(
      "select due_at at time zone 'UTC' from private.nest_daily_summary_outbox where summary_date='2026-10-25'",
    ),
    "2026-10-25 01:30:00",
  );
  f.db.sql("update public.nest_notification_preferences set revision=2,daily_summary_time='19:30'");
  assert.equal(f.schedule("2026-03-29"), first);
  assert.equal(f.db.sql("select count(*) from private.nest_daily_summary_outbox"), "2");
  f.db.sql("update private.nest_daily_summary_outbox set state='started'");
  assert.equal(f.schedule("2026-03-29"), "");
  assert.equal(f.db.sql("select count(*) from private.nest_daily_summary_outbox"), "2");
});
test("missing consent, mute and removed membership prevent pending daily summaries", (t) => {
  const f = fixture(t);
  assert.equal(f.schedule("2026-09-23"), "");
  f.enable();
  const first = f.schedule("2026-09-23");
  f.db.sql(
    "update public.nest_notification_preferences set daily_summary_enabled=false,revision=2",
  );
  assert.equal(f.schedule("2026-09-23"), "");
  assert.equal(f.db.sql("select state from private.nest_daily_summary_outbox"), "cancelled");
  f.db.sql("update public.nest_notification_preferences set daily_summary_enabled=true,revision=3");
  assert.equal(f.schedule("2026-09-23"), first);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal(f.schedule("2026-09-23"), "");
  assert.equal(f.db.sql("select state from private.nest_daily_summary_outbox"), "cancelled");
  assert.equal(f.schedule("2026-09-23", 3), "");
});
test("summary storage and scheduler are inaccessible to API roles and reject invalid dates", (t) => {
  const f = fixture(t);
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.throws(() => f.db.sql(`set role ${role}; ${f.call("2026-09-23")}`), /permission denied/);
    assert.throws(
      () => f.db.sql(`set role ${role}; select * from private.nest_daily_summary_outbox`),
      /permission denied/,
    );
  }
  for (const date of ["infinity", "-infinity", "10000-01-01"])
    assert.throws(() => f.schedule(date), /Invalid summary identity/);
});
