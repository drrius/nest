import test from "node:test";
import assert from "node:assert/strict";
import { deliveryFixture, id, json } from "./push-delivery-fixture.mjs";
function setup(t) {
  const f = deliveryFixture(t);
  f.db.file("supabase/migrations/20260923002812_native_push_delivery_outcomes.sql");
  const delivery = f.prepare(),
    attempt = f.begin(delivery).attemptId;
  const sendSql = (result, target = attempt) =>
    `select private.nest_finish_push_send('${delivery}','${target}',${json(result)})`;
  const receiptSql = (result, ticket = "ticket-1") =>
    `select private.nest_finish_push_receipt('${delivery}','${attempt}','${ticket}',${json(result)})`;
  const send = (result) => JSON.parse(f.db.sql(sendSql(result)));
  const receipt = (result) => JSON.parse(f.db.sql(receiptSql(result)));
  return { ...f, delivery, attempt, sendSql, receiptSql, send, receipt };
}
test("ticket and provider receipt outcomes are independently immutable and idempotent", async (t) => {
  const f = setup(t),
    ticket = { status: "ticket", ticketId: "ticket-1" };
  const sent = f.send(ticket);
  assert.equal(f.db.sql("select state from private.nest_push_deliveries"), "ticket");
  assert.deepEqual(f.send(ticket), sent);
  const results = await Promise.all([
    f.db.concurrent(f.receiptSql({ status: "accepted" })),
    f.db.concurrent(f.receiptSql({ status: "accepted" })),
  ]);
  assert.equal(results[0].stdout, results[1].stdout);
  assert.equal(f.db.sql("select state from private.nest_push_deliveries"), "accepted");
  assert.deepEqual(
    f.send(ticket),
    sent,
    "historical ticket remains the original fact after receipt",
  );
  assert.equal(f.db.sql("select count(*) from private.nest_push_receipt_results"), "1");
  assert.equal(
    f.db.sql("select state from private.nest_renewal_reminder_outbox"),
    "pending",
    "one device acceptance must not suppress other devices",
  );
  assert.throws(
    () => f.receipt({ status: "rejected", reason: "provider_rejected" }),
    /receipt changed/,
  );
  assert.throws(
    () => f.db.sql(f.receiptSql({ status: "accepted" }, "other-ticket")),
    /receipt mismatch/,
  );
  assert.equal(f.begin(f.delivery), null);
});
test("unknown outcomes never become ready or accept an invented ticket afterward", (t) => {
  const f = setup(t),
    outcome = { status: "unknown" };
  const ack = f.send(outcome);
  assert.deepEqual(f.send(outcome), ack);
  assert.equal(f.prepare(), "");
  assert.equal(f.begin(f.delivery), null);
  assert.throws(() => f.send({ status: "ticket", ticketId: "ticket-1" }), /outcome changed/);
  assert.throws(() => f.db.sql(f.sendSql(outcome, id(1800))), /attempt mismatch/);
  assert.throws(() => f.receipt({ status: "accepted" }), /receipt mismatch/);
});
test("invalid-device rejection disables only the captured registration revision", (t) => {
  const f = setup(t);
  f.send({ status: "rejected", reason: "device_not_registered" });
  assert.equal(f.db.sql("select token is null from private.nest_push_devices"), "t");
  assert.equal(f.db.sql("select state from private.nest_push_deliveries"), "rejected");
});
test("late invalid-device receipt cannot disable a newer registration", (t) => {
  const f = setup(t);
  f.send({ status: "ticket", ticketId: "ticket-1" });
  f.db.sql(
    "update private.nest_push_devices set revision=gen_random_uuid(),token='ExponentPushToken[Newer]' ",
  );
  f.receipt({ status: "rejected", reason: "device_not_registered" });
  assert.equal(f.db.sql("select token from private.nest_push_devices"), "ExponentPushToken[Newer]");
});
test("journal failure rolls back device invalidation and outcome state", (t) => {
  const f = setup(t);
  f.db.sql(
    "alter table private.nest_push_send_results add constraint fixture_no_result check(false)",
  );
  assert.throws(
    () => f.send({ status: "rejected", reason: "device_not_registered" }),
    /fixture_no_result/,
  );
  assert.equal(f.db.sql("select state from private.nest_push_deliveries"), "sending");
  assert.equal(f.db.sql("select token is not null from private.nest_push_devices"), "t");
  assert.equal(f.db.sql("select count(*) from private.nest_push_send_results"), "0");
});
test("outcomes reject raw provider messages, unknown fields, malformed tickets and direct API access", (t) => {
  const f = setup(t);
  const invalid = [
    null,
    {},
    { status: "accepted" },
    { status: "ticket" },
    { status: "ticket", ticketId: "with space" },
    { status: "unknown", message: "sensitive" },
    { status: "rejected", reason: "unrecognized" },
    { status: "rejected", reason: "device_not_registered", token: "sensitive" },
  ];
  for (const value of invalid) assert.throws(() => f.send(value), /Invalid push/);
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.throws(
      () => f.db.sql(`set role ${role}; select * from private.nest_push_send_results`),
      /permission denied/,
    );
    assert.throws(
      () => f.db.sql(`set role ${role}; ${f.sendSql({ status: "unknown" })}`),
      /permission denied/,
    );
  }
  f.send({ status: "unknown" });
  assert.throws(() => f.db.sql("delete from private.nest_push_send_results"));
});
test("failure to journal a send attempt rolls begin back before releasing a token", (t) => {
  const f = deliveryFixture(t);
  f.db.file("supabase/migrations/20260923002812_native_push_delivery_outcomes.sql");
  const delivery = f.prepare();
  f.db.sql(
    "alter table private.nest_push_delivery_attempts add constraint fixture_no_attempt check(false)",
  );
  assert.throws(() => f.begin(delivery), /fixture_no_attempt/);
  assert.equal(f.db.sql("select state from private.nest_push_deliveries"), "ready");
  assert.equal(f.db.sql("select attempt_id is null from private.nest_push_deliveries"), "t");
  f.db.sql("alter table private.nest_push_delivery_attempts drop constraint fixture_no_attempt");
  assert.equal(f.begin(delivery).deliveryId, delivery);
  assert.equal(f.db.sql("select count(*) from private.nest_push_delivery_attempts"), "1");
  assert.throws(() => f.db.sql("delete from private.nest_push_delivery_attempts"));
});
