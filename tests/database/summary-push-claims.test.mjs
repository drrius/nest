import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, json } from "./summary-push-fixture.mjs";
test("summary claims share the immutable push journal and release one token under concurrency", async (t) => {
  const f = fixture(t),
    delivery = f.prepare();
  assert.equal(f.prepare(), delivery);
  const attempts = await Promise.all([
    f.db.concurrent(f.beginSql(delivery)),
    f.db.concurrent(f.beginSql(delivery)),
  ]);
  const claims = attempts
    .map((a) => a.stdout.trim())
    .filter(Boolean)
    .map(JSON.parse);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].summaryId, f.summaryId);
  assert.equal(claims[0].recipientId, id(1));
  assert.equal(claims[0].token, "ExponentPushToken[DeliveryFixture]");
  assert.equal(f.db.sql("select count(*) from private.nest_push_delivery_attempts"), "1");
  f.db.sql(
    `select private.nest_finish_push_send('${delivery}','${claims[0].attemptId}',${json({ status: "ticket", ticketId: "summary-ticket" })})`,
  );
  f.db.sql(
    `select private.nest_finish_push_receipt('${delivery}','${claims[0].attemptId}','summary-ticket',${json({ status: "accepted" })})`,
  );
  assert.equal(
    f.db.sql(`select state from private.nest_push_deliveries where id='${delivery}'`),
    "accepted",
  );
  assert.equal(f.prepare(), "");
  const renewal = f.begin(f.renewalPrepare());
  assert.equal(renewal.renewalId, id(900));
  assert.equal("summaryId" in renewal, false);
});
test("summary token release rechecks consent, current timing, token revision and session", async (t) => {
  for (const mutation of [
    "update public.nest_notification_preferences set daily_summary_enabled=false",
    "update public.nest_notification_preferences set daily_summary_time='23:59'",
    "update private.nest_push_devices set revision=gen_random_uuid()",
    "update private.nest_push_devices set token=null",
    "delete from auth.sessions",
    `insert into private.nest_push_revoked_sessions values('${id(1)}','${id(1700)}')`,
    `delete from public.household_members where user_id='${id(1)}'`,
  ])
    await t.test(mutation.split(" ").slice(0, 3).join(" "), (sub) => {
      const f = fixture(sub),
        delivery = f.prepare();
      f.db.sql(mutation);
      assert.equal(f.begin(delivery), null);
      assert.equal(f.db.sql("select count(*) from private.nest_push_delivery_attempts"), "0");
    });
});
