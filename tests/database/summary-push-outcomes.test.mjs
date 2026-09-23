import test from "node:test";
import assert from "node:assert/strict";
import { fixture, json } from "./summary-push-fixture.mjs";
function sending(t) {
  const f = fixture(t),
    delivery = f.prepare(),
    attempt = f.begin(delivery).attemptId;
  const finish = (result, identity = attempt) =>
    JSON.parse(
      f.db.sql(`select private.nest_finish_push_send('${delivery}','${identity}',${json(result)})`),
    );
  const retry = () => f.db.sql(`select private.nest_retry_push_delivery('${delivery}')`);
  return { ...f, delivery, attempt, finish, retry };
}
test("summary rejection disables only the captured registration revision", async (t) => {
  for (const rotated of [false, true])
    await t.test(String(rotated), (sub) => {
      const f = sending(sub);
      if (rotated) f.db.sql("update private.nest_push_devices set revision=gen_random_uuid()");
      f.finish({ status: "rejected", reason: "device_not_registered" });
      assert.equal(
        f.db.sql("select token is null from private.nest_push_devices"),
        rotated ? "f" : "t",
      );
      assert.equal(f.retry(), "f");
    });
});
test("summary rate-limit retries retain capped backoff, current consent and immutable acknowledgments", (t) => {
  const f = sending(t),
    result = { status: "rejected", reason: "rate_limited" };
  const first = f.finish(result);
  assert.equal(f.retry(), "f");
  f.db.sql(
    "alter table private.nest_push_send_results disable trigger all; update private.nest_push_send_results set recorded_at=clock_timestamp()-interval '2 minutes'; alter table private.nest_push_send_results enable trigger all",
  );
  f.db.sql("update public.nest_notification_preferences set daily_summary_enabled=false");
  assert.equal(f.retry(), "f");
  f.db.sql("update public.nest_notification_preferences set daily_summary_enabled=true");
  assert.equal(f.retry(), "t");
  const second = f.begin(f.delivery);
  assert.notEqual(second.attemptId, f.attempt);
  assert.deepEqual(f.finish(result, f.attempt), first);
  f.finish({ status: "unknown" }, second.attemptId);
  assert.equal(f.retry(), "f");
});
test("ambiguous summary sends cannot be requeued and source identities cannot be mixed", (t) => {
  const f = sending(t);
  f.finish({ status: "unknown" });
  assert.equal(f.retry(), "f");
  assert.equal(f.prepare(), "");
  assert.throws(
    () =>
      f.db.sql(
        `update private.nest_push_deliveries set outbox_id='${f.outbox}' where id='${f.delivery}'`,
      ),
    /nest_push_exactly_one_source/,
  );
});

test("renewal deliveries retain revision-bound invalid-token handling after summary support", (t) => {
  const f = fixture(t),
    delivery = f.renewalPrepare(),
    attempt = f.begin(delivery);
  f.db.sql(
    `select private.nest_finish_push_send('${delivery}','${attempt.attemptId}',${json({ status: "rejected", reason: "device_not_registered" })})`,
  );
  assert.equal(f.db.sql("select token is null from private.nest_push_devices"), "t");
  assert.equal(f.prepare(), "");
});
