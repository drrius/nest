import assert from "node:assert/strict";
import { test } from "node:test";
import { recurringApiFixture, run, id } from "./recurring-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
async function fixture(t) {
  const f = await recurringApiFixture(t, [
    "supabase/migrations/20260921210444_native_recurring_state_command.sql",
    "supabase/migrations/20260921211106_native_recurring_state_recovery.sql",
    "supabase/migrations/20260921215304_native_recurring_resume_command.sql",
  ]);
  const saved = await run(f.client().saveRecurring({ operationId: id(600), rule: f.rule }));
  const paused = await run(
    f.client().saveRecurringState({
      operationId: id(601),
      change: {
        ruleId: f.rule.ruleId,
        expectedRevision: saved.revision,
        expectedStatus: "active",
        action: "pause",
      },
    }),
  );
  const input = {
    operationId: id(700),
    change: {
      ruleId: f.rule.ruleId,
      expectedRevision: paused.revision,
      expectedStatus: "paused",
      action: "resume",
      resumeFrom: f.rule.configuration.startDate,
      firstDueOn: f.rule.firstDueOn,
    },
  };
  return { ...f, input };
}
test("native resumption recovers a lost committed response with exact prospective configuration and private identity", async (t) => {
  const f = await fixture(t),
    proxy = await lostResponseProxy(t, f.url, "/v1/money/recurring/resume/save");
  await assert.rejects(run(f.client(proxy.url).saveRecurringResume(f.input)));
  const recovered = await run(f.client().recoverRecurringResume(f.input));
  assert.equal(proxy.dropped(), 1);
  assert.equal(recovered.status, "recorded");
  assert.equal(recovered.receipt.status, "active");
  assert.deepEqual(recovered.receipt.configuration, f.rule.configuration);
  assert.deepEqual(recovered.receipt.change, f.input.change);
  assert.deepEqual(await run(f.client().saveRecurringResume(f.input)), recovered.receipt);
  assert.deepEqual(await run(f.client().cancelRecurringResumeSave(f.input)), recovered);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "3");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(
    (await run(f.client(f.url, 2, f.partnerBearer).recoverRecurringResume(f.input))).status,
    "unresolved",
  );
  await assert.rejects(
    run(
      f.client().recoverRecurringResume({
        ...f.input,
        change: { ...f.input.change, resumeFrom: "2099-01-01", firstDueOn: "2099-01-31" },
      }),
    ),
  );
  // Stop-only recovery cannot mislabel a resumed mandate as paused/cancelled.
  await assert.rejects(
    run(
      f.client().recoverRecurringState({
        operationId: id(700),
        change: {
          ruleId: f.input.change.ruleId,
          expectedRevision: f.input.change.expectedRevision,
          expectedStatus: "paused",
          action: "cancel",
        },
      }),
    ),
  );
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await assert.rejects(run(f.client().recoverRecurringResume(f.input)));
});
test("lost resumption abandonment fences late Save and keeps the existing rule paused", async (t) => {
  const f = await fixture(t),
    proxy = await lostResponseProxy(t, f.url, "/v1/money/recurring/resume/cancel-save");
  await assert.rejects(run(f.client(proxy.url).cancelRecurringResumeSave(f.input)));
  const recovered = await run(f.client().recoverRecurringResume(f.input));
  assert.equal(recovered.status, "cancelled");
  assert.equal(recovered.receipt, null);
  await assert.rejects(run(f.client().saveRecurringResume(f.input)));
  assert.deepEqual(await run(f.client().cancelRecurringResumeSave(f.input)), recovered);
  assert.equal(f.db.sql("select status from public.nest_recurring_rules"), "paused");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "2");
});
test("concurrent resumption and abandonment produce one durable outcome and strict routes require explicit inputs", async (t) => {
  const f = await fixture(t),
    client = f.client();
  const [save, abandon] = await Promise.allSettled([
    run(client.saveRecurringResume(f.input)),
    run(client.cancelRecurringResumeSave(f.input)),
  ]);
  assert.equal(abandon.status, "fulfilled");
  const recovered = await run(client.recoverRecurringResume(f.input));
  assert.deepEqual(recovered, abandon.value);
  if (recovered.status === "recorded") {
    assert.equal(save.status, "fulfilled");
    assert.deepEqual(save.value, recovered.receipt);
  } else {
    assert.equal(recovered.status, "cancelled");
    assert.equal(save.status, "rejected");
  }
  for (const { path, input } of [
    { path: "/save?extra=1", input: f.input },
    { path: "/save", input: { ...f.input, approved: true } },
    { path: "/execute", input: f.input },
    { path: "/cancel-save", input: { operationId: id(701), extra: true } },
  ])
    assert.equal((await f.send(`/v1/money/recurring/resume${path}`, input)).status, 400);
  const duplicate = await fetch(
    `${f.url}/v1/money/recurring/resume/receipt?operationId=${id(700)}&operationId=${id(701)}`,
    { headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) } },
  );
  assert.equal(duplicate.status, 400);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
