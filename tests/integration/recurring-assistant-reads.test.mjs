import assert from "node:assert/strict";
import { test } from "node:test";
import { moneyTools } from "../../apps/api/src/money/tools.ts";
import { recurringApiFixture, id, run } from "./recurring-api-fixture.mjs";
const invocation = { toolCallId: "recurring-read", messages: [] };
test("AI recurring reads share native snapshots and pagination without mutation, deny foreign/revoked callers", async (t) => {
  const f = await recurringApiFixture(t),
    client = f.client();
  for (let n = 0; n < 51; n++)
    await run(
      client.saveRecurring({
        operationId: id(2000 + n),
        rule: { ...f.rule, ruleId: id(1000 + n) },
      }),
    );
  const config = { url: f.supabaseUrl, publishableKey: "sb_publishable_fixture" };
  const toolsFor = (token = f.bearer, household = id(10)) =>
    moneyTools(
      new Request("http://localhost/assistant", {
        headers: { authorization: `Bearer ${token}`, "x-nest-household": household },
      }),
      config,
    );
  const tools = toolsFor();
  const first = await tools.listRecurringRules.execute({ after: null }, invocation);
  assert.equal(first.ok, true);
  assert.equal(first.value.rules.length, 50);
  assert.deepEqual(first.value, await run(client.recurringRules(null)));
  const second = await tools.listRecurringRules.execute({ after: first.value.next }, invocation);
  assert.equal(second.ok, true);
  assert.equal(second.value.rules.length, 1);
  assert.equal(second.value.next, null);
  const detail = await tools.readRecurringRule.execute({ ruleId: id(1000) }, invocation);
  assert.deepEqual(detail, { ok: true, value: await run(client.recurringRule(id(1000))) });
  for (const input of [{ after: "bad" }, { after: null, householdId: id(99) }])
    assert.equal((await tools.listRecurringRules.execute(input, invocation)).ok, false);
  assert.equal(
    (await toolsFor(f.otherBearer).readRecurringRule.execute({ ruleId: id(1000) }, invocation)).ok,
    false,
  );
  assert.equal(
    (await toolsFor(f.bearer, id(99)).listRecurringRules.execute({ after: null }, invocation)).ok,
    false,
  );
  assert.equal(
    (await toolsFor(f.partnerBearer).readRecurringRule.execute({ ruleId: id(1000) }, invocation))
      .ok,
    true,
  );
  f.db.sql(`delete from public.household_members where user_id='${id(2)}'`);
  assert.deepEqual(
    await toolsFor(f.partnerBearer).readRecurringRule.execute({ ruleId: id(1000) }, invocation),
    { ok: false, code: "forbidden" },
  );
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "51");
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "0");
});
