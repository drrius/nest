import assert from "node:assert/strict";
import { test } from "node:test";
import { recurringApiFixture, run, id } from "./recurring-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
async function fixture(t) {
  const f = await recurringApiFixture(t, [
    "supabase/migrations/20260921210444_native_recurring_state_command.sql",
    "supabase/migrations/20260921211106_native_recurring_state_recovery.sql",
  ]);
  const saved = await run(f.client().saveRecurring({ operationId: id(600), rule: f.rule }));
  const input = {
    operationId: id(700),
    change: {
      ruleId: f.rule.ruleId,
      expectedRevision: saved.revision,
      expectedStatus: "active",
      action: "pause",
    },
  };
  return { ...f, input };
}
test("lost native pause response recovers the exact stopped revision without repeating or undoing it", async (t) => {
  const f = await fixture(t),
    proxy = await lostResponseProxy(t, f.url, "/v1/money/recurring/state/save");
  await assert.rejects(run(f.client(proxy.url).saveRecurringState(f.input)));
  assert.equal(proxy.dropped(), 1);
  const current = f.client(),
    recovered = await run(current.recoverRecurringState(f.input));
  assert.equal(recovered.status, "recorded");
  assert.equal(recovered.receipt.status, "paused");
  assert.deepEqual(recovered.receipt.change, f.input.change);
  assert.deepEqual(await run(current.saveRecurringState(f.input)), recovered.receipt);
  assert.deepEqual(await run(current.cancelRecurringStateSave(f.input)), recovered);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_state_receipts"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "2");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(
    (await run(f.client(f.url, 2, f.partnerBearer).recoverRecurringState(f.input))).status,
    "unresolved",
  );
  await assert.rejects(
    run(
      current.recoverRecurringState({
        ...f.input,
        change: { ...f.input.change, action: "cancel" },
      }),
    ),
  );
  await assert.rejects(
    run(
      current.saveRecurringState({ ...f.input, change: { ...f.input.change, action: "cancel" } }),
    ),
  );
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await assert.rejects(run(current.recoverRecurringState(f.input)));
});
test("lost abandonment response remains recoverable and prevents a late stop request", async (t) => {
  const f = await fixture(t),
    proxy = await lostResponseProxy(t, f.url, "/v1/money/recurring/state/cancel-save");
  assert.equal((await run(f.client().recoverRecurringState(f.input))).status, "unresolved");
  await assert.rejects(run(f.client(proxy.url).cancelRecurringStateSave(f.input)));
  assert.equal(proxy.dropped(), 1);
  const result = await run(f.client().recoverRecurringState(f.input));
  assert.equal(result.status, "cancelled");
  assert.equal(result.receipt, null);
  await assert.rejects(run(f.client().saveRecurringState(f.input)));
  assert.deepEqual(await run(f.client().cancelRecurringStateSave(f.input)), result);
  assert.equal(f.db.sql("select status from public.nest_recurring_rules"), "active");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_state_receipts"), "0");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("concurrent stop and abandonment have one durable outcome; invalid routes cannot smuggle approval", async (t) => {
  const f = await fixture(t),
    client = f.client();
  const [stop, abandon] = await Promise.allSettled([
    run(client.saveRecurringState(f.input)),
    run(client.cancelRecurringStateSave(f.input)),
  ]);
  assert.equal(abandon.status, "fulfilled");
  const result = await run(client.recoverRecurringState(f.input));
  assert.deepEqual(result, abandon.value);
  if (result.status === "recorded") {
    assert.equal(stop.status, "fulfilled");
    assert.deepEqual(stop.value, result.receipt);
    assert.equal(f.db.sql("select status from public.nest_recurring_rules"), "paused");
  } else {
    assert.equal(result.status, "cancelled");
    assert.equal(stop.status, "rejected");
    assert.equal(f.db.sql("select status from public.nest_recurring_rules"), "active");
  }
  for (const { path, input } of [
    { path: "/save?extra=1", input: f.input },
    { path: "/save", input: { ...f.input, approved: true } },
    { path: "/execute", input: f.input },
    { path: "/cancel-save", input: { operationId: id(701), approved: true } },
  ])
    assert.equal((await f.send(`/v1/money/recurring/state${path}`, input)).status, 400);
  const response = await fetch(
    `${f.url}/v1/money/recurring/state/receipt?operationId=${id(700)}&operationId=${id(701)}`,
    {
      headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) },
    },
  );
  assert.equal(response.status, 400);
});
