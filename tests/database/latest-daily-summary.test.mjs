import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id } from "./daily-summary-content-fixture.mjs";
import * as Schema from "../../apps/api/node_modules/effect/dist/Schema.js";
import { LatestDailySummary } from "../../packages/contracts/src/daily-summary.ts";
test("latest saved summary is recipient-only, excludes unavailable rows and survives delivery opt-out", (t) => {
  const f = fixture(t);
  for (const name of [
    "20260923014222_native_daily_summary_schedule",
    "20260923015620_native_daily_summary_snapshot",
    "20260923015956_native_daily_summary_read",
    "20260923083514_native_latest_daily_summary",
  ])
    f.db.file(`supabase/migrations/${name}.sql`);
  const read = (actor = 1, household = 10) =>
    Schema.decodeUnknownSync(LatestDailySummary)(
      JSON.parse(
        f.db.sql(`set role authenticated;
    set request.jwt.claim.sub='${id(actor)}'; select public.nest_read_latest_daily_summary('${id(household)}')`),
      ),
    );
  assert.equal(read().latest, null);
  f.db
    .sql(`insert into private.nest_daily_summary_outbox(id,household_id,recipient_id,summary_date,preference_revision,due_at,state)
    values ('${id(600)}','${id(10)}','${id(1)}',current_date-2,1,now(),'started'),
      ('${id(601)}','${id(10)}','${id(1)}',current_date-1,1,now(),'started'),
      ('${id(602)}','${id(10)}','${id(2)}',current_date,1,now(),'started'),
      ('${id(603)}','${id(10)}','${id(1)}',current_date,1,now(),'pending'),
      ('${id(604)}','${id(10)}','${id(1)}',current_date+2,1,now(),'started');
    insert into private.nest_daily_summary_snapshots(outbox_id,content)
      select id,private.nest_daily_summary_content(household_id,recipient_id,summary_date)
      from private.nest_daily_summary_outbox;
    update public.nest_notification_preferences set daily_summary_enabled=false;`);
  assert.equal(read().latest.summaryId, id(601));
  assert.equal(read(2).latest.summaryId, id(602));
  assert.throws(() => read(3), /Not authorized/);
  assert.throws(() => read(1, 11), /Not authorized/);
  for (const role of ["anon", "service_role"])
    assert.throws(
      () => f.db.sql(`set role ${role}; select public.nest_read_latest_daily_summary('${id(10)}')`),
      /permission denied/,
    );
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => read(), /Not authorized/);
});
