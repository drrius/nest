import test from "node:test";
import assert from "node:assert/strict";
import * as Schema from "../../apps/api/node_modules/effect/dist/Schema.js";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const { DailySummary } = await import(require.resolve("@nest/contracts/daily-summary"));
import { fixture, id } from "./daily-summary-content-fixture.mjs";
test("summary uses current shared and accepted responsibilities, scheduled meals and assigned renewals", (t) => {
  const f = fixture(t);
  f.chore(4100);
  f.chore(4101, { actor: 2 });
  f.chore(4102, { actor: 2, accepted: 1 });
  f.chore(4103, { date: "2028-02-29" });
  f.chore(4104, { role: "preview" });
  f.chore(4105);
  f.db.sql(`update public.routines set paused_at=now() where id='${id(4105)}';
    insert into public.meal_plan_entries(household_id,date,slot,title_snapshot) values('${id(10)}','2028-03-01','dinner','Private dinner');
    insert into public.nest_renewals values('${id(10)}','${id(6000)}','${id(6001)}','Private renewal','2028-03-01',0,'${id(2)}',null,false)`);
  const first = Schema.decodeUnknownSync(DailySummary)(f.content(), { onExcessProperty: "error" });
  assert.equal(first.choresDue.count, 2);
  assert.equal(first.choresOverdue.count, 1);
  assert.equal(first.mealsPlanned.count, 1);
  assert.equal(first.renewalsDue.count, 0);
  assert.equal(f.content(2).choresDue.count, 2);
  assert.equal(f.content(2).renewalsDue.count, 1);
  assert.equal(f.content(2).cancellationDeadlines.count, 1);
  assert.equal(JSON.stringify(first).includes("Private"), false);
  f.db.sql(
    `update public.routine_occurrences set status='completed',role=null,closed_at=now() where id='${id(5100)}'`,
  );
  assert.equal(f.content().choresDue.count, 1);
});
test("summary content fails closed for absent consent, other households and API roles", (t) => {
  const f = fixture(t);
  assert.equal(f.content(3), null);
  f.db.sql("update public.nest_notification_preferences set daily_summary_enabled=false");
  assert.equal(f.content(), null);
  for (const role of ["anon", "authenticated", "service_role"])
    assert.throws(() => f.db.sql(`set role ${role}; ${f.query()}`), /permission denied/);
});

test("large summaries report a bounded count explicitly and omit removed renewals", (t) => {
  const f = fixture(t);
  f.db.sql(
    `insert into public.nest_renewals select '${id(10)}',gen_random_uuid(),gen_random_uuid(),'Renewal','2028-03-01',0,null,null,false from generate_series(1,1001)`,
  );
  const summary = Schema.decodeUnknownSync(DailySummary)(f.content());
  assert.deepEqual(summary.renewalsDue, { count: 1000, more: true });
  assert.deepEqual(summary.cancellationDeadlines, { count: 1000, more: true });
  f.db.sql("update public.nest_renewals set removed=true");
  assert.deepEqual(f.content().renewalsDue, { count: 0, more: false });
  assert.equal(
    Schema.is(DailySummary)({ ...summary, renewalsDue: { count: 3, more: true } }),
    false,
  );
});
