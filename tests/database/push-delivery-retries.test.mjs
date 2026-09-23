import test from "node:test";
import assert from "node:assert/strict";
import { deliveryFixture, json } from "./push-delivery-fixture.mjs";
function setup(t, aged = false) {
  const f = deliveryFixture(t);
  f.db.file("supabase/migrations/20260923002812_native_push_delivery_outcomes.sql");
  f.db.file("supabase/migrations/20260923003328_native_push_delivery_retries.sql");
  // Fixture clock offset permits deterministic backoff tests without sleeping.
  if (aged)
    for (const table of ["nest_push_send_results", "nest_push_receipt_results"])
      f.db.sql(
        `alter table private.${table} alter column recorded_at set default (clock_timestamp()-interval '2 minutes')`,
      );
  const delivery = f.prepare();
  const send = (attempt, result) =>
    JSON.parse(
      f.db.sql(`select private.nest_finish_push_send('${delivery}','${attempt}',${json(result)})`),
    );
  const receipt = (attempt, ticket, result) =>
    JSON.parse(
      f.db.sql(
        `select private.nest_finish_push_receipt('${delivery}','${attempt}','${ticket}',${json(result)})`,
      ),
    );
  const retrySql = `select private.nest_retry_push_delivery('${delivery}')`;
  return { ...f, delivery, send, receipt, retrySql, retry: () => f.db.sql(retrySql) === "t" };
}
const limited = { status: "rejected", reason: "rate_limited" };
test("rate-limit retries are bounded to three attempts and preserve historical acknowledgments", (t) => {
  const f = setup(t, true),
    initial = f.begin(f.delivery);
  const historical = f.send(initial.attemptId, limited);
  assert.equal(f.retry(), true);
  assert.equal(f.retry(), false);
  const second = f.begin(f.delivery);
  assert.notEqual(second.attemptId, initial.attemptId);
  assert.deepEqual(f.send(initial.attemptId, limited), historical);
  f.send(second.attemptId, limited);
  assert.equal(f.retry(), true);
  const third = f.begin(f.delivery);
  f.send(third.attemptId, limited);
  assert.equal(f.retry(), false);
  assert.equal(f.db.sql("select count(*) from private.nest_push_delivery_attempts"), "3");
  assert.equal(f.db.sql("select count(*) from private.nest_push_send_results"), "3");
});
test("fresh rate-limit rejection respects backoff", (t) => {
  const f = setup(t),
    attempt = f.begin(f.delivery);
  f.send(attempt.attemptId, limited);
  assert.equal(f.retry(), false);
  assert.equal(f.begin(f.delivery), null);
});
test("unknown and permanent rejections cannot be retried even after the backoff window", async (t) => {
  for (const result of [
    { status: "unknown" },
    { status: "rejected", reason: "provider_rejected" },
    { status: "rejected", reason: "invalid_credentials" },
  ])
    await t.test(result.reason ?? result.status, (sub) => {
      const f = setup(sub, true),
        attempt = f.begin(f.delivery);
      f.send(attempt.attemptId, result);
      assert.equal(f.retry(), false);
    });
});
test("retry uses fresh authorization and only one concurrent caller requeues", async (t) => {
  const f = setup(t, true),
    attempt = f.begin(f.delivery);
  f.send(attempt.attemptId, limited);
  f.db.sql("update public.nest_notification_preferences set item_reminders_enabled=false");
  assert.equal(f.retry(), false);
  f.db.sql("update public.nest_notification_preferences set item_reminders_enabled=true");
  const results = await Promise.all([f.db.concurrent(f.retrySql), f.db.concurrent(f.retrySql)]);
  assert.deepEqual(results.map((r) => r.stdout.trim()).sort(), ["f", "t"]);
  f.db.sql("update private.nest_push_devices set token=null,revision=gen_random_uuid()");
  assert.equal(f.begin(f.delivery), null, "begin revalidates a change after retry preparation");
});
test("receipt rejection supports retry without forgetting the old ticket and receipt", (t) => {
  const f = setup(t, true),
    attempt = f.begin(f.delivery);
  const ticket = { status: "ticket", ticketId: "old-ticket" };
  const sent = f.send(attempt.attemptId, ticket),
    received = f.receipt(attempt.attemptId, ticket.ticketId, limited);
  assert.equal(f.retry(), true);
  const next = f.begin(f.delivery);
  assert.deepEqual(f.send(attempt.attemptId, ticket), sent);
  assert.deepEqual(f.receipt(attempt.attemptId, ticket.ticketId, limited), received);
  assert.throws(() => f.send(next.attemptId, ticket), /unique constraint/);
  assert.equal(f.db.sql("select state from private.nest_push_deliveries"), "sending");
});
test("a crashed send expires to unknown without replay, while a late actual ticket can persist", (t) => {
  const f = setup(t),
    attempt = f.begin(f.delivery);
  f.db.sql(
    "update private.nest_push_deliveries set started_at=clock_timestamp()-interval '3 minutes'",
  );
  assert.equal(f.db.sql("select private.nest_expire_push_sends()"), "1");
  assert.equal(f.db.sql("select private.nest_expire_push_sends()"), "0");
  assert.equal(f.retry(), false);
  assert.equal(f.begin(f.delivery), null);
  f.send(attempt.attemptId, { status: "ticket", ticketId: "late-ticket" });
  assert.equal(f.db.sql("select state from private.nest_push_deliveries"), "ticket");
  for (const role of ["anon", "authenticated", "service_role"])
    assert.throws(() => f.db.sql(`set role ${role}; ${f.retrySql}`), /permission denied/);
});
test("expiry processes at most one hundred stale attempts per invocation", (t) => {
  const f = setup(t);
  f.db
    .sql(`insert into private.nest_push_deliveries(outbox_id,installation_id,registration_revision,state,attempt_id,started_at)
    select '${f.outbox}',gen_random_uuid(),gen_random_uuid(),'sending',gen_random_uuid(),clock_timestamp()-interval '3 minutes' from generate_series(1,105)`);
  f.db.sql(
    "insert into private.nest_push_delivery_attempts select attempt_id,id,registration_revision,started_at from private.nest_push_deliveries where attempt_id is not null",
  );
  assert.equal(f.db.sql("select private.nest_expire_push_sends()"), "100");
  assert.equal(f.db.sql("select private.nest_expire_push_sends()"), "5");
  assert.equal(f.db.sql("select private.nest_expire_push_sends()"), "0");
  assert.equal(
    f.db.sql("select count(*) from private.nest_push_deliveries where state='unknown'"),
    "105",
  );
});
