import test from "node:test";
import assert from "node:assert/strict";
import { apnsDeliveryFixture, id, json } from "./apns-delivery-fixture.mjs";
test("APNs provider acceptance is immutable and never becomes an Expo ticket or phone receipt", (t) => {
  const f = apnsDeliveryFixture(t),
    delivery = f.renewalPrepare(),
    attempt = f.beginApns(delivery);
  const result = { status: "provider_accepted", apnsId: attempt.attemptId };
  const ack = f.finish(delivery, attempt.attemptId, result);
  assert.deepEqual(ack, {
    version: 1,
    provider: "apns",
    deliveryId: delivery,
    attemptId: attempt.attemptId,
    result,
  });
  assert.deepEqual(f.finish(delivery, attempt.attemptId, result), ack);
  assert.equal(
    f.db.sql(
      `select state||':'||(ticket_id is null)::text from private.nest_push_deliveries where id='${delivery}'`,
    ),
    "provider_accepted:true",
  );
  assert.equal(f.db.sql("select count(*) from private.nest_push_receipt_results"), "0");
  assert.equal(
    f.db.sql("select jsonb_array_length(private.nest_claim_push_receipt_polls()->'claims')"),
    "0",
  );
  assert.equal(f.db.sql(`select private.nest_retry_push_delivery('${delivery}')`), "f");
  assert.throws(
    () => f.finish(delivery, attempt.attemptId, { status: "unknown" }),
    /outcome changed/,
  );
  assert.throws(
    () =>
      f.db.sql(
        `set role service_role; select public.nest_finish_push_send('${delivery}','${attempt.attemptId}',${json({ status: "ticket", ticketId: "fake" })})`,
      ),
    /own endpoint/,
  );
  assert.throws(
    () => f.db.sql("delete from private.nest_push_send_results"),
    /immutable|append.only|cannot/i,
  );
});
test("unknown or closed APNs attempts never authorize resend and malformed outcomes do not change state", (t) => {
  const f = apnsDeliveryFixture(t),
    delivery = f.renewalPrepare(),
    attempt = f.beginApns(delivery);
  const before = f.providerState();
  for (const result of [
    { status: "provider_accepted", apnsId: id(999) },
    { status: "ticket", ticketId: "fake" },
    { status: "accepted" },
    { status: "unknown", token: "private" },
    { status: "rejected", reason: "device_not_registered" },
    { status: "rejected", reason: "invalid_device", invalidatedAt: -1 },
    { status: "rejected", reason: "invalid_device", invalidatedAt: 9007199254740992 },
    { status: "rejected", reason: "rate_limited", invalidatedAt: 1 },
  ]) {
    assert.throws(() => f.finish(delivery, attempt.attemptId, result));
    assert.equal(f.providerState(), before);
  }
  f.db.sql(`update private.nest_push_deliveries set state='cancelled' where id='${delivery}'`);
  assert.throws(
    () => f.finish(delivery, attempt.attemptId, { status: "unknown" }),
    /attempt closed/,
  );
  f.db.sql(`update private.nest_push_deliveries set state='unknown' where id='${delivery}'`);
  f.finish(delivery, attempt.attemptId, { status: "unknown" });
  assert.equal(f.db.sql(`select private.nest_retry_push_delivery('${delivery}')`), "f");
  assert.equal(f.beginApns(delivery), null);
  assert.equal(f.renewalPrepare(), "");
});
test("outcome persistence failure rolls back acceptance and permits only exact acknowledgement recovery", (t) => {
  const f = apnsDeliveryFixture(t),
    delivery = f.renewalPrepare(),
    attempt = f.beginApns(delivery);
  const result = { status: "provider_accepted", apnsId: attempt.attemptId },
    before = f.providerState();
  f.db.sql(
    "alter table private.nest_push_send_results add constraint fixture_no_apns check(acknowledgment->>'provider'<>'apns')",
  );
  assert.throws(() => f.finish(delivery, attempt.attemptId, result), /fixture_no_apns/);
  assert.equal(f.providerState(), before);
  f.db.sql("alter table private.nest_push_send_results drop constraint fixture_no_apns");
  const ack = f.finish(delivery, attempt.attemptId, result);
  assert.deepEqual(f.finish(delivery, attempt.attemptId, result), ack);
});
