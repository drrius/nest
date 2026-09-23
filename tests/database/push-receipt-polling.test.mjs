import test from "node:test";
import assert from "node:assert/strict";
import { deliveryFixture, json } from "./push-delivery-fixture.mjs";
function setup(t) {
  const f = deliveryFixture(t);
  for (const name of [
    "20260923002812_native_push_delivery_outcomes",
    "20260923003328_native_push_delivery_retries",
    "20260923003827_native_push_receipt_polling",
  ])
    f.db.file(`supabase/migrations/${name}.sql`);
  const delivery = f.prepare(),
    attempt = f.begin(delivery).attemptId;
  const send = () =>
    f.db.sql(
      `select private.nest_finish_push_send('${delivery}','${attempt}',${json({ status: "ticket", ticketId: "poll-ticket" })})`,
    );
  const receipt = (result) =>
    f.db.sql(
      `select private.nest_finish_push_receipt('${delivery}','${attempt}','poll-ticket',${json(result)})`,
    );
  const claimSql = "select private.nest_claim_push_receipt_polls()";
  const claim = () => JSON.parse(f.db.sql(claimSql));
  const due = () =>
    f.db.sql(
      "update private.nest_push_receipt_polls set next_at=clock_timestamp()-interval '1 second'",
    );
  return { ...f, delivery, attempt, send, receipt, claimSql, claim, due };
}
test("tickets schedule delayed token-free polling, with one concurrent claim and backoff", async (t) => {
  const f = setup(t);
  const ack = f.send();
  assert.equal(f.send(), ack);
  assert.equal(f.db.sql("select count(*) from private.nest_push_receipt_polls"), "1");
  assert.deepEqual(f.claim(), { scanned: 0, claims: [] });
  f.due();
  const results = await Promise.all([f.db.concurrent(f.claimSql), f.db.concurrent(f.claimSql)]);
  const claims = results.flatMap((r) => JSON.parse(r.stdout).claims);
  assert.deepEqual(claims, [
    { version: 1, deliveryId: f.delivery, attemptId: f.attempt, ticketId: "poll-ticket" },
  ]);
  assert.equal(f.claim().scanned, 0);
  assert.equal(f.db.sql("select polls from private.nest_push_receipt_polls"), "1");
  assert.equal(
    f.db.sql(
      "select next_at>clock_timestamp()+interval '14 minutes' from private.nest_push_receipt_polls",
    ),
    "t",
  );
});
test("poll budget exhaustion becomes unknown without resending and late actual receipt can settle", (t) => {
  const f = setup(t);
  f.send();
  for (let n = 0; n < 8; n++) {
    f.due();
    assert.equal(f.claim().claims.length, 1);
  }
  f.due();
  assert.deepEqual(f.claim(), { scanned: 1, claims: [] });
  assert.equal(f.db.sql("select state from private.nest_push_deliveries"), "unknown");
  assert.equal(f.prepare(), "");
  assert.equal(f.begin(f.delivery), null);
  f.receipt({ status: "accepted" });
  assert.equal(f.db.sql("select state from private.nest_push_deliveries"), "accepted");
  assert.deepEqual(f.claim(), { scanned: 0, claims: [] });
});
test("deadline expiration is uncertain, and a malformed late receipt cannot reopen state", (t) => {
  const f = setup(t);
  f.send();
  f.db.sql(
    "update private.nest_push_receipt_polls set next_at=clock_timestamp()-interval '2 minutes',deadline=clock_timestamp()-interval '1 minute'",
  );
  assert.deepEqual(f.claim(), { scanned: 1, claims: [] });
  assert.throws(
    () => f.receipt({ status: "accepted", message: "private" }),
    /Invalid push outcome/,
  );
  assert.equal(f.db.sql("select state from private.nest_push_deliveries"), "unknown");
  assert.equal(f.db.sql("select closed from private.nest_push_receipt_polls"), "t");
});
test("receipt acceptance closes polling and replaying the send cannot reopen it", (t) => {
  const f = setup(t);
  f.send();
  f.receipt({ status: "accepted" });
  f.send();
  f.due();
  assert.deepEqual(f.claim(), { scanned: 0, claims: [] });
  for (const role of ["anon", "authenticated", "service_role"])
    assert.throws(() => f.db.sql(`set role ${role}; ${f.claimSql}`), /permission denied/);
});
test("poll persistence failure rolls back ticket recording", (t) => {
  const f = setup(t);
  f.db.sql(
    "alter table private.nest_push_receipt_polls add constraint fixture_no_poll check(false)",
  );
  assert.throws(() => f.send(), /fixture_no_poll/);
  assert.equal(f.db.sql("select state from private.nest_push_deliveries"), "sending");
  assert.equal(f.db.sql("select count(*) from private.nest_push_send_results"), "0");
});
test("poll sweeps inspect at most one hundred due rows and expose scan progress", (t) => {
  const f = setup(t);
  f.send();
  f.db
    .sql(`insert into private.nest_push_deliveries(outbox_id,installation_id,registration_revision,state,attempt_id,started_at,ticket_id)
    select '${f.outbox}',gen_random_uuid(),gen_random_uuid(),'ticket',gen_random_uuid(),clock_timestamp()-interval '30 minutes','bulk-'||n from generate_series(1,105) n`);
  f.db.sql(
    "insert into private.nest_push_delivery_attempts select attempt_id,id,registration_revision,started_at from private.nest_push_deliveries where ticket_id like 'bulk-%'",
  );
  f.db.sql(
    "insert into private.nest_push_receipt_polls(attempt_id,delivery_id,ticket_id,next_at,deadline) select attempt_id,id,ticket_id,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour' from private.nest_push_deliveries where ticket_id like 'bulk-%'",
  );
  const first = f.claim(),
    second = f.claim();
  assert.equal(first.scanned, 100);
  assert.equal(first.claims.length, 100);
  assert.equal(second.scanned, 5);
  assert.equal(second.claims.length, 5);
  assert.deepEqual(f.claim(), { scanned: 0, claims: [] });
  for (const role of ["anon", "authenticated", "service_role"])
    assert.throws(
      () => f.db.sql(`set role ${role}; select * from private.nest_push_receipt_polls`),
      /permission denied/,
    );
});
