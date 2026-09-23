import assert from "node:assert/strict";
import { test } from "node:test";
import { moneyTools } from "../../apps/api/src/money/tools.ts";
import { recurringApiFixture, id, run } from "./recurring-api-fixture.mjs";
test("due-bill HTTP and AI reads agree, reject extra authority and revoked access without writes", async (t) => {
  const f = await recurringApiFixture(t, [
    "supabase/migrations/20260923031451_native_due_variable_rules.sql",
  ]);
  const today = f.db.sql("select (clock_timestamp() at time zone 'Europe/Zurich')::date");
  const weekday = Number(f.db.sql(`select extract(isodow from date '${today}')`));
  await run(
    f.client().saveRecurring({
      operationId: id(2000),
      rule: {
        ...f.rule,
        firstDueOn: today,
        configuration: {
          ...f.rule.configuration,
          mode: "variable",
          amountCentimes: null,
          allocations: null,
          startDate: today,
          schedule: { kind: "weekly", weekday },
        },
      },
    }),
  );
  const headers = { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) };
  const response = await fetch(`${f.url}/v1/money/recurring/due-variable`, { headers });
  assert.equal(response.status, 200);
  const page = await response.json();
  assert.deepEqual(await run(f.client().dueVariableRules()), page);
  assert.equal(page.rules.length, 1);
  assert.equal(page.rules[0].nextDueOn, today);
  const tool = moneyTools(new Request("http://localhost/assistant", { headers }), {
    url: f.supabaseUrl,
    publishableKey: "sb_publishable_fixture",
  }).listDueVariableBills;
  const invocation = { toolCallId: "due-bills", messages: [] };
  assert.deepEqual(await tool.execute({ after: null }, invocation), { ok: true, value: page });
  for (const query of ["?householdId=" + id(99), "?after=bad", "?after=&after="])
    assert.equal(
      (await fetch(`${f.url}/v1/money/recurring/due-variable${query}`, { headers })).status,
      400,
    );
  assert.equal((await tool.execute({ after: null, householdId: id(99) }, invocation)).ok, false);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await tool.execute({ after: null }, invocation)).ok, false);
  assert.equal((await fetch(`${f.url}/v1/money/recurring/due-variable`, { headers })).status, 403);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "0");
});
