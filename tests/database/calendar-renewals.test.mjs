import test from "node:test";
import assert from "node:assert/strict";
import * as Schema from "../../apps/api/node_modules/effect/dist/Schema.js";
import { CalendarRenewals } from "../../packages/contracts/src/calendar-renewals.ts";
import { fixture, id, as } from "./renewal-fixture.mjs";
function setup(t) {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260923012644_native_calendar_renewals.sql");
  f.record(f.save());
  const sql = (date, after = null) =>
    `select public.nest_calendar_renewals('${id(10)}','${date}',${after ? `'${String(after)}'` : "null"})`;
  const read = (date, after) =>
    Schema.decodeUnknownSync(CalendarRenewals)(JSON.parse(f.db.sql(as(1, sql(date, after)))));
  return { ...f, sql, read };
}
test("calendar projection includes renewal and leap-year cancellation days without duplicating same-day entries", (t) => {
  const f = setup(t);
  assert.equal(f.read("2028-03-01").renewals.length, 1);
  assert.equal(f.read("2028-02-29").renewals.length, 1);
  assert.equal(f.read("2028-02-28").renewals.length, 0);
  f.db.sql("update public.nest_renewals set notice_days=0");
  assert.equal(f.read("2028-03-01").renewals.length, 1);
  f.db.sql("update public.nest_renewals set removed=true");
  assert.equal(f.read("2028-03-01").renewals.length, 0);
});
test("calendar renewal pages preserve all matching items and enforce household access", (t) => {
  const f = setup(t);
  f.db
    .sql(`insert into public.nest_renewals select household_id,gen_random_uuid(),gen_random_uuid(),title,
    renewal_on,notice_days,responsible_id,recurring_rule_id,false from public.nest_renewals cross join generate_series(1,55)`);
  const first = f.read("2028-03-01"),
    second = f.read("2028-03-01", first.next);
  assert.equal(first.renewals.length, 50);
  assert.equal(second.renewals.length, 6);
  assert.equal(second.next, null);
  assert.equal(new Set([...first.renewals, ...second.renewals].map((v) => v.renewalId)).size, 56);
  assert.throws(() => f.db.sql(as(3, f.sql("2028-03-01"))), /Not authorized/);
  assert.throws(() => f.db.sql("set role anon; " + f.sql("2028-03-01")), /permission denied/);
  assert.throws(() => f.db.sql(as(1, f.sql("infinity"))), /Invalid calendar date/);
});
