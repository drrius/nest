import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, run, Effect, Fetch } from "./renewal-fixture.mjs";
import { fixture as sqlite } from "../../apps/mobile/tests/offline-fixture.mjs";
import { calendarClient } from "../../apps/mobile/src/calendar/client.ts";
import { calendarRenewalOperations } from "../../apps/mobile/src/calendar/renewal-operations.ts";
import { CalendarRenewalRuntime } from "../../apps/mobile/src/calendar/renewal-runtime.ts";
test("optional Calendar renewal layer pages real data and clears on date/background/account replacement", async (t) => {
  const f = await fixture(t, ["supabase/migrations/20260923012644_native_calendar_renewals.sql"]);
  await run(f.native.save(f.command));
  f.db
    .sql(`insert into public.nest_renewals select household_id,gen_random_uuid(),gen_random_uuid(),title,
    renewal_on,notice_days,responsible_id,recurring_rule_id,false from public.nest_renewals cross join generate_series(1,55)`);
  const local = await sqlite(t);
  const session = await run(local.store.activate({ actor: id(1), household: id(10) }, id(950)));
  const client = calendarClient(
    f.url,
    { actor: id(1), household: id(10) },
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
  const operations = calendarRenewalOperations({ store: local.store, session }, client);
  const runtime = new CalendarRenewalRuntime(
    { read: (date, after) => operations.read(date, after).pipe(Effect.provide(Fetch.layer)) },
    "2028-02-29",
  );
  t.after(() => runtime.dispose());
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().rows, null);
  await runtime.setEnabled(true);
  assert.equal(runtime.getSnapshot().rows.length, 50);
  await runtime.loadMore();
  assert.equal(runtime.getSnapshot().rows.length, 56);
  assert.equal(runtime.getSnapshot().next, null);
  await runtime.changeDate("2028-02-28");
  assert.deepEqual(runtime.getSnapshot().rows, []);
  await runtime.setActive(false);
  assert.equal(runtime.getSnapshot().rows, null);
  await run(local.store.activate({ actor: id(2), household: id(10) }, id(951)));
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().rows, null);
  assert.equal(runtime.getSnapshot().access, false);
});
