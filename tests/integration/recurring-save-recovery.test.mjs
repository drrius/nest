import assert from "node:assert/strict";
import { test } from "node:test";
import { recurringApiFixture, run, id } from "./recurring-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
test("fresh native transport recovers lost Save/cancel acknowledgments without changing a committed mandate", async (t) => {
  const f = await recurringApiFixture(t);
  const saveProxy = await lostResponseProxy(t, f.url, "/v1/money/recurring/save");
  const command = { operationId: id(500), rule: f.rule };
  await assert.rejects(run(f.client(saveProxy.url).saveRecurring(command)), {
    code: "unavailable",
  });
  const recovered = await run(f.client().recoverRecurring(command));
  assert.equal(recovered.status, "recorded");
  assert.deepEqual(recovered.receipt.rule, f.rule);
  assert.deepEqual(await run(f.client().cancelRecurringSave(command)), recovered);
  assert.equal((await run(f.client().recurringRule(f.rule.ruleId))).rule.status, "active");
  const pending = { operationId: id(501), rule: { ...f.rule, ruleId: id(502) } };
  assert.equal((await run(f.client().recoverRecurring(pending))).status, "unresolved");
  const cancelProxy = await lostResponseProxy(t, f.url, "/v1/money/recurring/cancel-save");
  await assert.rejects(run(f.client(cancelProxy.url).cancelRecurringSave(pending)), {
    code: "unavailable",
  });
  assert.equal((await run(f.client().recoverRecurring(pending))).status, "cancelled");
  await assert.rejects(run(f.client().saveRecurring(pending)), { code: "conflict" });
  await assert.rejects(
    run(f.client().recoverRecurring({ ...command, rule: { ...f.rule, firstDueOn: "2099-01-01" } })),
    { code: "unavailable" },
  );
  await assert.rejects(run(f.client(f.url, 3, f.otherBearer).recoverRecurring(command)), {
    code: "forbidden",
  });
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_save_cancellations"), "1");
  assert.equal(saveProxy.dropped(), 1);
  assert.equal(cancelProxy.dropped(), 1);
  assert.equal(
    (
      await f.send("/v1/money/recurring/cancel-save?operationId=" + id(500), {
        operationId: id(500),
      })
    ).status,
    400,
  );
});
