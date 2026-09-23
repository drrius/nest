import test from "node:test";
import assert from "node:assert/strict";
import { setup, id } from "./grocery-reminder-schedule-fixture.mjs";
test("source cursor progresses past 250 retained deleted items and wraps for later changes", (t) => {
  const f = setup(t);
  f.db
    .sql(`insert into public.nest_grocery_reminders(household_id,item_id,revision,reviewed_item_version,updated_by,settings)
    select household_id,('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,gen_random_uuid(),reviewed_item_version,updated_by,settings
    from public.nest_grocery_reminders cross join generate_series(10000,10249) n`);
  assert.deepEqual(f.materialize(), { scanned: 250, inserted: 0, wrapped: false });
  assert.deepEqual(f.materialize(), { scanned: 1, inserted: 2, wrapped: true });
  assert.deepEqual(f.materialize(), { scanned: 250, inserted: 0, wrapped: false });
  assert.deepEqual(f.materialize(), { scanned: 1, inserted: 0, wrapped: true });
});
test("cancellation cursor limits inspected rows to 500 and reaches later obsolete work", (t) => {
  const f = setup(t);
  f.db
    .sql(`insert into private.nest_grocery_reminder_outbox(household_id,item_id,item_version,schedule_revision,recipient_id,due_at)
    select '${id(10)}',gen_random_uuid(),1,gen_random_uuid(),'${id(1)}','2028-03-26 01:30Z'
    from generate_series(1,501)`);
  assert.deepEqual(f.cancel(), { scanned: 500, cancelled: 500, wrapped: false });
  assert.deepEqual(f.cancel(), { scanned: 1, cancelled: 1, wrapped: true });
  assert.deepEqual(f.cancel(), { scanned: 0, cancelled: 0, wrapped: true });
});
