import test from "node:test";
import assert from "node:assert/strict";
import { apnsDeliveryFixture, id } from "./apns-delivery-fixture.mjs";
test("APNs begins exactly one provider/environment-bound attempt for all six authorized kinds", (t) => {
  const f = apnsDeliveryFixture(t);
  const sources = [
    [f.renewalPrepare, "renewalId"],
    [f.summaryPrepare, "summaryId"],
    [f.chorePrepare, "occurrenceId"],
    [f.mealPrepare, "entryId"],
    [f.groceryPrepare, "itemId"],
    [f.prepare, "ruleId"],
  ];
  for (const [prepare, key] of sources) {
    const delivery = prepare();
    assert.ok(delivery, key);
    assert.equal(f.beginApns(delivery, "production"), null);
    assert.equal(f.begin(delivery), null, "legacy worker cannot receive the token");
    const attempt = f.beginApns(delivery);
    assert.equal(attempt.provider, "apns");
    assert.equal(attempt.environment, "sandbox");
    assert.equal(attempt.apnsId, attempt.attemptId);
    assert.equal(attempt.deliveryId, delivery);
    assert.equal(attempt.token, f.command.token);
    assert.ok(attempt[key]);
    assert.equal(f.beginApns(delivery), null);
  }
  assert.equal(f.db.sql("select count(*) from private.nest_apns_delivery_attempts"), "6");
  assert.equal(f.db.sql("select count(*) from private.nest_push_delivery_attempts"), "6");
  for (const role of ["anon", "authenticated"]) {
    assert.throws(
      () =>
        f.db.sql(
          `set role ${role}; select public.nest_begin_apns_delivery('${id(999)}','sandbox')`,
        ),
      /permission denied/,
    );
    assert.throws(
      () =>
        f.db.sql(
          `set role ${role}; select public.nest_finish_apns_send('${id(999)}','${id(998)}','{}')`,
        ),
      /permission denied/,
    );
  }
  for (const role of ["anon", "authenticated", "service_role"])
    assert.throws(
      () => f.db.sql(`set role ${role}; select * from private.nest_apns_delivery_attempts`),
      /permission denied/,
    );
  assert.throws(
    () => f.db.sql("delete from private.nest_apns_delivery_attempts"),
    /immutable|append.only|cannot/i,
  );
});
test("APNs begin still checks fresh registration, mute, membership and live session authority", (t) => {
  const changes = [
    "update private.nest_push_devices set revision=gen_random_uuid()",
    "update public.nest_notification_preferences set item_reminders_enabled=false",
    `delete from public.household_members where user_id='${id(1)}'`,
    `insert into private.nest_push_revoked_sessions values('${id(1)}','${id(1700)}')`,
    "update auth.sessions set not_after=clock_timestamp()-interval '1 second'",
  ];
  for (const change of changes) {
    const f = apnsDeliveryFixture(t),
      delivery = f.renewalPrepare();
    f.db.sql(change);
    assert.equal(f.beginApns(delivery), null);
    assert.equal(f.db.sql("select count(*) from private.nest_apns_delivery_attempts"), "0");
    assert.equal(
      f.db.sql(`select state from private.nest_push_deliveries where id='${delivery}'`),
      "cancelled",
    );
  }
});
