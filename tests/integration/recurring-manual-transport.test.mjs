import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, run } from "./recurring-manual-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const root = "/v1/money/recurring/manual";
test("manual Save response loss recovers the exact expense without duplicate ledger or cycle", async (t) => {
  const f = await fixture(t),
    proxy = await lostResponseProxy(t, f.url, `${root}/save`);
  await assert.rejects(run(f.client(proxy.url).saveManualCycle(f.command)));
  const result = await run(f.client().recoverManualCycle(f.command));
  assert.equal(result.status, "recorded");
  assert.equal(proxy.dropped(), 1);
  assert.deepEqual(result.receipt.input, f.command.input);
  assert.equal(result.receipt.linkedExpense.event.amountCentimes, "101");
  assert.deepEqual(await run(f.client().saveManualCycle(f.command)), result.receipt);
  assert.deepEqual(await run(f.client().cancelManualCycleSave(f.command)), result);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "1");
  assert.equal(f.db.sql("select sum(receivable_delta_cents) from public.ledger_entries"), "0");
  assert.equal(
    (await run(f.client(f.url, 2, f.partnerBearer).recoverManualCycle(f.command))).status,
    "unresolved",
  );
  await assert.rejects(
    run(
      f.client().recoverManualCycle({
        ...f.command,
        input: {
          ...f.command.input,
          sourceEventId: id(999),
        },
      }),
    ),
  );
  await assert.rejects(run(f.client(f.url, 3, f.otherBearer).recoverManualCycle(f.command)));
});
test("lost cycle abandonment persists a tombstone that fences late Save without changing the bill", async (t) => {
  const f = await fixture(t),
    proxy = await lostResponseProxy(t, f.url, `${root}/cancel-save`);
  await assert.rejects(run(f.client(proxy.url).cancelManualCycleSave(f.command)));
  const result = await run(f.client().recoverManualCycle(f.command));
  assert.equal(proxy.dropped(), 1);
  assert.equal(result.status, "cancelled");
  assert.equal(result.receipt, null);
  await assert.rejects(run(f.client().saveManualCycle(f.command)));
  assert.deepEqual(await run(f.client().cancelManualCycleSave(f.command)), result);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(
    f.db.sql("select next_due_on::text from private.nest_recurring_execution"),
    f.command.input.dueOn,
  );
});
test("Save and abandonment race has one outcome; strict manual routes reject altered command boundaries", async (t) => {
  const f = await fixture(t);
  await Promise.allSettled([
    run(f.client().saveManualCycle(f.command)),
    run(f.client().cancelManualCycleSave(f.command)),
  ]);
  const result = await run(f.client().recoverManualCycle(f.command));
  assert.ok(["recorded", "cancelled"].includes(result.status));
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.deepEqual(await run(f.client().cancelManualCycleSave(f.command)), result);
  for (const [path, body] of [
    [`${root}/save?extra=1`, f.command],
    [`${root}/save`, { ...f.command, approvalId: id(800) }],
    [`${root}/execute`, f.command],
    [`${root}/cancel-save`, { ...f.command }],
  ])
    assert.equal((await f.send(path, body)).status, 400);
  const response = await fetch(
    `${f.url}${root}/receipt?operationId=${id(700)}&operationId=${id(700)}`,
    { headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) } },
  );
  assert.equal(response.status, 400);
});
test("approved manual execution cannot be reinterpreted as direct Save recovery", async (t) => {
  const f = await fixture(t);
  const approvalId = await f.rpc("nest_propose_action", {
    p_household: id(10),
    p_invocation: id(700),
    p_command: "recurring.link-cycle",
    p_version: 1,
    p_payload: f.command.input,
  });
  await f.rpc("nest_decide_action", {
    p_id: approvalId,
    p_invocation: id(700),
    p_command: "recurring.link-cycle",
    p_version: 1,
    p_payload: f.command.input,
    p_approved: true,
  });
  const response = await f.send(`${root}/execute`, { ...f.command, approvalId });
  assert.equal(response.status, 200);
  await assert.rejects(run(f.client().recoverManualCycle(f.command)));
  await assert.rejects(run(f.client().cancelManualCycleSave(f.command)));
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(
    f.db.sql("select count(*) from public.nest_recurring_cycle_save_cancellations"),
    "0",
  );
});

test("manual and variable recovery cannot reinterpret each other's receipts", async (t) => {
  const f = await fixture(t);
  await run(f.client().saveVariableCycle(f.variableCommand));
  await assert.rejects(run(f.client().recoverManualCycle(f.command)));
  await assert.rejects(run(f.client().saveManualCycle(f.command)));
  await assert.rejects(run(f.client().cancelManualCycleSave(f.command)));
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "2");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "1");
});
