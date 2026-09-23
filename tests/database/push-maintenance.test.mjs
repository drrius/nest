import test from "node:test";
import assert from "node:assert/strict";
import { deliveryFixture } from "./push-delivery-fixture.mjs";
function setup(t) {
  const f = deliveryFixture(t);
  for (const name of [
    "20260923002812_native_push_delivery_outcomes",
    "20260923003328_native_push_delivery_retries",
    "20260923011300_native_push_maintenance",
  ])
    f.db.file(`supabase/migrations/${name}.sql`);
  const tick = () =>
    JSON.parse(f.db.sql("set role service_role; select public.nest_maintain_push_deliveries()"));
  return { ...f, tick };
}
test("maintenance materializes stable UTC windows idempotently and respects mute state", (t) => {
  const f = setup(t);
  f.db.sql(
    "delete from private.nest_renewal_reminder_outbox; delete from private.nest_renewal_reminder_scans",
  );
  const result = f.tick();
  assert.equal(result.previous.scanned, 1);
  assert.equal(result.current.scanned, 1);
  const outbox = f.db.sql("select id from private.nest_renewal_reminder_outbox");
  assert.ok(outbox);
  f.tick();
  assert.equal(f.db.sql("select id from private.nest_renewal_reminder_outbox"), outbox);
  assert.equal(f.db.sql("select count(*) from private.nest_renewal_reminder_scans"), "2");
  f.db.sql("update public.nest_notification_preferences set item_reminders_enabled=false");
  assert.equal(f.tick().obsolete.cancelled, 1);
  assert.equal(f.db.sql("select state from private.nest_renewal_reminder_outbox"), "cancelled");
});
test("maintenance expires crashed attempts into uncertainty and denies ordinary callers", (t) => {
  const f = setup(t),
    delivery = f.prepare();
  f.begin(delivery);
  f.db.sql(
    "update private.nest_push_deliveries set started_at=clock_timestamp()-interval '3 minutes'",
  );
  assert.equal(f.tick().expired, 1);
  assert.equal(f.db.sql("select state from private.nest_push_deliveries"), "unknown");
  assert.equal(f.tick().expired, 0);
  for (const role of ["anon", "authenticated"])
    assert.throws(
      () => f.db.sql(`set role ${role}; select public.nest_maintain_push_deliveries()`),
      /permission denied/,
    );
});

test("maintenance requeues only confirmed rate limits after backoff under fresh authorization", (t) => {
  const f = setup(t),
    delivery = f.prepare();
  f.db.sql(
    "alter table private.nest_push_send_results alter column recorded_at set default (clock_timestamp()-interval '2 minutes')",
  );
  const attempt = f.begin(delivery);
  f.db.sql(
    `select private.nest_finish_push_send('${delivery}','${attempt.attemptId}','{"status":"rejected","reason":"rate_limited"}')`,
  );
  f.db.sql("update public.nest_notification_preferences set item_reminders_enabled=false");
  assert.equal(f.tick().retries.requeued, 0);
  f.db.sql("update public.nest_notification_preferences set item_reminders_enabled=true");
  assert.equal(f.tick().retries.requeued, 1);
  assert.equal(f.db.sql("select state from private.nest_push_deliveries"), "ready");
  const next = f.begin(delivery);
  f.db.sql(
    `select private.nest_finish_push_send('${delivery}','${next.attemptId}','{"status":"rejected","reason":"invalid_credentials"}')`,
  );
  assert.equal(f.tick().retries.requeued, 0);
  assert.equal(f.db.sql("select count(*) from private.nest_push_delivery_attempts"), "2");
});

test("retry maintenance advances across more than one hundred permanently rejected deliveries", (t) => {
  const f = setup(t);
  f.db
    .sql(`insert into private.nest_push_devices(installation_id,actor_id,household_id,revision,token,session_id)
    select gen_random_uuid(),actor_id,household_id,gen_random_uuid(),'ExponentPushToken[bounded'||n||']',session_id
    from private.nest_push_devices cross join generate_series(1,105) n;
    do $$ declare d record; delivery uuid; attempt jsonb; begin
      for d in select installation_id from private.nest_push_devices where token like 'ExponentPushToken[bounded%' loop
        delivery:=private.nest_prepare_push_delivery('${f.outbox}',d.installation_id);
        attempt:=private.nest_begin_push_delivery(delivery);
        perform private.nest_finish_push_send(delivery,(attempt->>'attemptId')::uuid,'{"status":"rejected","reason":"invalid_credentials"}');
      end loop;
    end $$;`);
  assert.deepEqual(f.tick().retries, { scanned: 100, requeued: 0, wrapped: false });
  assert.deepEqual(f.tick().retries, { scanned: 5, requeued: 0, wrapped: true });
  assert.equal(f.db.sql("select count(*) from private.nest_push_delivery_attempts"), "105");
});
