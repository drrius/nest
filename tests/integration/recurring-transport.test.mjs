import assert from "node:assert/strict";
import { test } from "node:test";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { recurringApiFixture as fixture, run, id } from "./recurring-api-fixture.mjs";
test("native → real API/PostgREST mandate retry and reads preserve one authorized revision", async (t) => {
  const f = await fixture(t),
    path = "/v1/money/recurring/save";
  const proxy = await lostResponseProxy(t, f.url, path),
    client = f.client(proxy.url);
  const command = { operationId: id(200), rule: f.rule };
  await assert.rejects(run(client.saveRecurring(command)), { code: "unavailable" });
  const receipt = await run(client.saveRecurring(command));
  assert.deepEqual(receipt.rule, f.rule);
  assert.deepEqual(await run(client.saveRecurring(command)), receipt);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "1");
  assert.equal(proxy.dropped(), 1);
  const first = await run(client.recurringRules());
  assert.equal(first.rules.length, 1);
  assert.equal(first.rules[0].revision, receipt.revision);
  assert.equal(first.rules[0].nextDueOn, f.rule.firstDueOn);
  assert.deepEqual(
    (await run(f.client(f.url, 2, f.partnerBearer).recurringRule(f.rule.ruleId))).rule,
    first.rules[0],
  );
  assert.equal((await run(client.recurringRules(first.rules[0].ruleId))).rules.length, 0);
  await assert.rejects(run(f.client(f.url, 3, f.otherBearer).recurringRules()), {
    code: "forbidden",
  });
  assert.equal((await f.send(path + "?origin=ui", command)).status, 400);
  const invalid = await fetch(
    `${f.url}/v1/money/recurring/rules?after=${id(100)}&after=${id(101)}`,
    {
      headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) },
    },
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.headers.get("cache-control"), "no-store");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("real approved recurring API execution cannot substitute a direct Save or foreign approver", async (t) => {
  const f = await fixture(t),
    operationId = id(300),
    path = "/v1/money/recurring/execute";
  const approvalId = await f.rpc("nest_propose_action", {
    p_household: id(10),
    p_invocation: operationId,
    p_command: "recurring.create",
    p_version: 1,
    p_payload: f.rule,
  });
  const command = { operationId, rule: f.rule, approvalId };
  assert.equal((await f.send(path, command)).status, 409);
  await f.rpc("nest_decide_action", {
    p_id: approvalId,
    p_invocation: operationId,
    p_command: "recurring.create",
    p_version: 1,
    p_payload: f.rule,
    p_approved: true,
  });
  assert.equal((await f.send(path, command, f.partnerBearer)).status, 403);
  assert.equal((await f.send(path, command)).status, 200);
  assert.equal((await f.send(path, command)).status, 200);
  assert.equal(
    (await f.send("/v1/money/recurring/save", { operationId, rule: f.rule })).status,
    400,
  );
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "1");
  assert.equal(
    f.db.sql(`select status from public.nest_action_approvals where id='${approvalId}'`),
    "consumed",
  );
});
