import test from "node:test";
import assert from "node:assert/strict";
import { deliveryFixture, id } from "./push-delivery-fixture.mjs";
test("delivery preparation deduplicates and only one concurrent begin releases the token", async (t) => {
  const f = deliveryFixture(t),
    delivery = f.prepare();
  assert.equal(f.prepare(), delivery);
  const results = await Promise.all([
    f.db.concurrent(f.beginSql(delivery)),
    f.db.concurrent(f.beginSql(delivery)),
  ]);
  const values = results
    .map((result) => result.stdout.trim())
    .filter(Boolean)
    .map(JSON.parse);
  assert.equal(values.length, 1);
  assert.equal(values[0].token, "ExponentPushToken[DeliveryFixture]");
  assert.equal(values[0].householdId, id(10));
  assert.equal(values[0].renewalId, id(900));
  assert.equal(f.begin(delivery), null);
  assert.equal(f.prepare(), "");
  assert.equal(f.db.sql("select state from private.nest_push_deliveries"), "sending");
});
test("send-time authorization rejects changed recipient, item, token and session state", async (t) => {
  const mutations = [
    "update public.nest_notification_preferences set item_reminders_enabled=false",
    "update public.nest_renewals set removed=true",
    "update public.nest_renewal_reminders set revision=gen_random_uuid()",
    "update private.nest_push_devices set revision=gen_random_uuid()",
    "update private.nest_push_devices set token=null",
    `update private.nest_push_devices set actor_id='${id(2)}'`,
    "update private.nest_renewal_reminder_outbox set state='sent'",
    "update private.nest_renewal_reminder_outbox set due_at=clock_timestamp()-interval '2 days'",
    "delete from auth.sessions",
    "update auth.sessions set not_after=clock_timestamp()-interval '1 second'",
    `insert into private.nest_push_revoked_sessions values('${id(1)}','${id(1700)}')`,
    `delete from public.household_members where user_id='${id(1)}'`,
    "update private.nest_renewal_reminder_outbox set due_at=clock_timestamp()+interval '1 hour'",
  ];
  for (const mutation of mutations)
    await t.test(mutation.split(" ").slice(0, 3).join(" "), (sub) => {
      const f = deliveryFixture(sub),
        delivery = f.prepare();
      f.db.sql(mutation);
      assert.equal(f.begin(delivery), null);
      assert.equal(f.db.sql("select state from private.nest_push_deliveries"), "cancelled");
      assert.equal(f.db.sql("select attempt_id is null from private.nest_push_deliveries"), "t");
    });
});
test("private claims cannot be read or executed by API roles and session ownership must match", (t) => {
  const f = deliveryFixture(t);
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.throws(
      () => f.db.sql(`set role ${role}; select * from private.nest_push_deliveries`),
      /permission denied/,
    );
    assert.throws(
      () =>
        f.db.sql(
          `set role ${role}; select private.nest_prepare_push_delivery('${f.outbox}','${id(1702)}')`,
        ),
      /permission denied/,
    );
  }
  f.db.sql(`update auth.sessions set user_id='${id(2)}'`);
  assert.equal(f.prepare(), "");
  assert.equal(f.db.sql("select count(*) from private.nest_push_deliveries"), "0");
});

test("an unsent cancelled preparation can resume after unmuting without duplicating its identity", (t) => {
  const f = deliveryFixture(t),
    delivery = f.prepare();
  f.db.sql("update public.nest_notification_preferences set item_reminders_enabled=false");
  assert.equal(f.begin(delivery), null);
  f.db.sql("update public.nest_notification_preferences set item_reminders_enabled=true");
  assert.equal(f.prepare(), delivery);
  assert.equal(f.begin(delivery).deliveryId, delivery);
  assert.equal(f.begin(delivery), null);
});
