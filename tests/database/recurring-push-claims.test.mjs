import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, json } from "./recurring-push-fixture.mjs";
test("recurring claims release exactly one token and share immutable outcomes with renewal and summary", async (t) => {
  const f = fixture(t),
    delivery = f.prepare();
  assert.equal(f.prepare(), delivery);
  const rows = await Promise.all([
    f.db.concurrent(f.beginSql(delivery)),
    f.db.concurrent(f.beginSql(delivery)),
  ]);
  const claims = rows
    .map((row) => row.stdout.trim())
    .filter(Boolean)
    .map(JSON.parse);
  assert.equal(claims.length, 1);
  const claim = claims[0];
  assert.equal(claim.ruleId, id(300));
  assert.equal(claim.outboxId, f.recurringOutbox);
  assert.equal(JSON.stringify(claim).includes("Private recurring"), false);
  assert.equal(f.db.sql("select count(*) from private.nest_push_delivery_attempts"), "1");
  const finish = `select private.nest_finish_push_send('${delivery}','${claim.attemptId}',${json({ status: "ticket", ticketId: "meal-ticket" })})`;
  assert.equal(f.db.sql(finish), f.db.sql(finish));
  f.db.sql(
    `select private.nest_finish_push_receipt('${delivery}','${claim.attemptId}','meal-ticket',${json({ status: "accepted" })})`,
  );
  assert.equal(f.prepare(), "");
  assert.equal(f.begin(f.groceryPrepare()).itemId, id(6001));
  assert.equal(f.begin(f.mealPrepare()).entryId, id(5001));
  assert.equal(f.begin(f.chorePrepare()).occurrenceId, id(4002));
  assert.equal(f.begin(f.renewalPrepare()).renewalId, id(900));
  assert.equal(f.begin(f.summaryPrepare()).summaryId, f.summaryId);
});
test("recurring token release rechecks item, recipient, registration and authenticated session", async (t) => {
  for (const mutation of [
    "update public.nest_notification_preferences set item_reminders_enabled=false",
    `update public.nest_recurring_rules set revision=gen_random_uuid() where id='${id(300)}'`,
    `update public.nest_recurring_rules set status='paused' where id='${id(300)}'`,
    `update private.nest_recurring_execution set next_due_on=next_due_on+1 where rule_id='${id(300)}'`,
    "update public.nest_recurring_reminders set revision=gen_random_uuid()",
    "update private.nest_push_devices set revision=gen_random_uuid()",
    "update private.nest_push_devices set token=null",
    "delete from auth.sessions",
    `delete from public.household_members where user_id='${id(1)}'`,
    `insert into private.nest_push_revoked_sessions values('${id(1)}','${id(1700)}')`,
  ])
    await t.test(mutation.split(" ").slice(0, 3).join(" "), (sub) => {
      const f = fixture(sub),
        delivery = f.prepare();
      f.db.sql(mutation);
      assert.equal(f.begin(delivery), null);
      assert.equal(f.db.sql("select count(*) from private.nest_push_delivery_attempts"), "0");
    });
});
test("unknown recurring sends cannot be resent and invalid device results disable the matching registration", (t) => {
  const f = fixture(t),
    delivery = f.prepare(),
    claim = f.begin(delivery);
  f.db.sql(
    `select private.nest_finish_push_send('${delivery}','${claim.attemptId}',${json({ status: "unknown" })})`,
  );
  assert.equal(f.db.sql(`select private.nest_retry_push_delivery('${delivery}')`), "f");
  assert.equal(f.prepare(), "");
  assert.equal(f.begin(delivery), null);
  const other = f.summaryPrepare(),
    attempt = f.begin(other);
  f.db.sql(
    `select private.nest_finish_push_send('${other}','${attempt.attemptId}',${json({ status: "rejected", reason: "device_not_registered" })})`,
  );
  assert.equal(f.db.sql("select token is null from private.nest_push_devices"), "t");
});

test("recurring rate-limit retries cap at three and revalidate recipient settings", (t) => {
  const f = fixture(t),
    delivery = f.prepare();
  f.db.sql(
    "alter table private.nest_push_send_results alter column recorded_at set default (clock_timestamp()-interval '2 minutes')",
  );
  const retry = () => f.db.sql(`select private.nest_retry_push_delivery('${delivery}')`);
  for (let n = 0; n < 3; n++) {
    const claim = f.begin(delivery);
    assert.ok(claim);
    f.db.sql(
      `select private.nest_finish_push_send('${delivery}','${claim.attemptId}',${json({ status: "rejected", reason: "rate_limited" })})`,
    );
    f.db.sql("update public.nest_notification_preferences set item_reminders_enabled=false");
    assert.equal(retry(), "f");
    f.db.sql("update public.nest_notification_preferences set item_reminders_enabled=true");
    assert.equal(retry(), n < 2 ? "t" : "f");
  }
  assert.equal(f.db.sql("select count(*) from private.nest_push_delivery_attempts"), "3");
});
test("recurring invalid-token receipt disables only the exact recipient registration", (t) => {
  const f = fixture(t),
    delivery = f.prepare(),
    claim = f.begin(delivery);
  f.db.sql(
    `select private.nest_finish_push_send('${delivery}','${claim.attemptId}',${json({ status: "ticket", ticketId: "invalid-meal-token" })})`,
  );
  f.db.sql(
    `select private.nest_finish_push_receipt('${delivery}','${claim.attemptId}','invalid-meal-token',${json({ status: "rejected", reason: "device_not_registered" })})`,
  );
  assert.equal(f.db.sql("select token is null from private.nest_push_devices"), "t");
  assert.equal(f.prepare(), "");
});
