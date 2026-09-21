import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, run } from "./recurring-variable-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const root = "/v1/money/recurring/variable";
test("variable Save response loss recovers the exact expense without duplicate ledger or cycle", async (t) => {
  const f = await fixture(t),
    proxy = await lostResponseProxy(t, f.url, `${root}/save`);
  await assert.rejects(run(f.client(proxy.url).saveVariableCycle(f.command)));
  const result = await run(f.client().recoverVariableCycle(f.command));
  assert.equal(result.status, "recorded");
  assert.equal(proxy.dropped(), 1);
  assert.deepEqual(result.receipt.input, f.command.input);
  assert.equal(result.receipt.expense.amountCentimes, "101");
  assert.deepEqual(await run(f.client().saveVariableCycle(f.command)), result.receipt);
  assert.deepEqual(await run(f.client().cancelVariableCycleSave(f.command)), result);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "1");
  assert.equal(f.db.sql("select sum(receivable_delta_cents) from public.ledger_entries"), "0");
  assert.equal(
    (await run(f.client(f.url, 2, f.partnerBearer).recoverVariableCycle(f.command))).status,
    "unresolved",
  );
  await assert.rejects(
    run(
      f.client().recoverVariableCycle({
        ...f.command,
        input: {
          ...f.command.input,
          amountCentimes: "102",
          allocations: [
            { memberId: id(1), centimes: "52" },
            { memberId: id(2), centimes: "50" },
          ],
        },
      }),
    ),
  );
  await assert.rejects(run(f.client(f.url, 3, f.otherBearer).recoverVariableCycle(f.command)));
});
test("lost cycle abandonment persists a tombstone that fences late Save without changing the bill", async (t) => {
  const f = await fixture(t),
    proxy = await lostResponseProxy(t, f.url, `${root}/cancel-save`);
  await assert.rejects(run(f.client(proxy.url).cancelVariableCycleSave(f.command)));
  const result = await run(f.client().recoverVariableCycle(f.command));
  assert.equal(proxy.dropped(), 1);
  assert.equal(result.status, "cancelled");
  assert.equal(result.receipt, null);
  await assert.rejects(run(f.client().saveVariableCycle(f.command)));
  assert.deepEqual(await run(f.client().cancelVariableCycleSave(f.command)), result);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(
    f.db.sql("select next_due_on::text from private.nest_recurring_execution"),
    f.command.input.dueOn,
  );
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await assert.rejects(run(f.client().recoverVariableCycle(f.command)));
  await assert.rejects(run(f.client().cancelVariableCycleSave(f.command)));
});
test("Save and abandonment race has one outcome; strict variable routes reject altered command boundaries", async (t) => {
  const f = await fixture(t);
  await Promise.allSettled([
    run(f.client().saveVariableCycle(f.command)),
    run(f.client().cancelVariableCycleSave(f.command)),
  ]);
  const result = await run(f.client().recoverVariableCycle(f.command));
  assert.ok(["recorded", "cancelled"].includes(result.status));
  assert.equal(
    f.db.sql("select count(*) from public.financial_events"),
    result.status === "recorded" ? "1" : "0",
  );
  assert.deepEqual(await run(f.client().cancelVariableCycleSave(f.command)), result);
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
test("approved variable execution cannot be reinterpreted as direct Save recovery", async (t) => {
  const f = await fixture(t);
  const approvalId = await f.rpc("nest_propose_action", {
    p_household: id(10),
    p_invocation: id(700),
    p_command: "recurring.record-cycle",
    p_version: 1,
    p_payload: f.command.input,
  });
  await f.rpc("nest_decide_action", {
    p_id: approvalId,
    p_invocation: id(700),
    p_command: "recurring.record-cycle",
    p_version: 1,
    p_payload: f.command.input,
    p_approved: true,
  });
  const response = await f.send(`${root}/execute`, { ...f.command, approvalId });
  assert.equal(response.status, 200);
  await assert.rejects(run(f.client().recoverVariableCycle(f.command)));
  await assert.rejects(run(f.client().cancelVariableCycleSave(f.command)));
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(
    f.db.sql("select count(*) from public.nest_recurring_cycle_save_cancellations"),
    "0",
  );
});
