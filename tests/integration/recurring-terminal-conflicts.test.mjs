import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, run } from "./recurring-manual-fixture.mjs";
const patch = "supabase/migrations/20260926100455_native_recurring_nonretryable_conflicts.sql";
async function rpc(f, name, operation, input) {
  const response = await fetch(`${f.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
    body: JSON.stringify({
      p_household: id(10),
      p_operation: id(operation),
      ...(input ? { p_input: input } : {}),
    }),
  });
  return { status: response.status, body: await response.json() };
}
function snapshot(f) {
  return f.db.sql(`select jsonb_build_object(
    'events',(select jsonb_agg(to_jsonb(e) order by id) from public.financial_events e),
    'rules',(select jsonb_agg(to_jsonb(r) order by id) from public.nest_recurring_rules r),
    'cycles',(select jsonb_agg(to_jsonb(c) order by rule_id,due_on) from public.nest_recurring_cycles c))`);
}
test("stale recurring configuration, state, resume and cycle commands never mutate the mandate or history", async (t) => {
  const f = await fixture(t, [patch]);
  const stale = { ...f.command.input, expectedRevision: id(999) };
  const cases = [
    { name: "nest_save_recurring", input: { ...f.rule, expectedRevision: id(999) } },
    {
      name: "nest_save_recurring_state",
      input: {
        ruleId: f.rule.ruleId,
        expectedRevision: id(999),
        expectedStatus: "active",
        action: "pause",
      },
    },
    {
      name: "nest_save_recurring_resume",
      input: {
        ruleId: f.rule.ruleId,
        expectedRevision: id(999),
        expectedStatus: "paused",
        action: "resume",
        resumeFrom: f.rule.firstDueOn,
        firstDueOn: f.rule.firstDueOn,
      },
    },
    {
      name: "nest_save_variable_cycle",
      input: { ...f.variableCommand.input, expectedRevision: id(999) },
    },
    { name: "nest_save_manual_cycle", input: stale },
  ];
  const before = snapshot(f);
  for (const entry of cases) {
    const result = await rpc(f, entry.name, 950, entry.input);
    assert.equal(result.status, 412, JSON.stringify(result));
    assert.equal(result.body.code, "PT412");
    assert.equal(snapshot(f), before);
  }
  f.db.sql(`do $$ begin
    perform private.nest_post_fixed_cycle('${id(10)}','${f.rule.ruleId}','${id(999)}','${f.rule.firstDueOn}');
    raise exception 'Expected stale fixed mandate conflict';
    exception when sqlstate 'PT412' then null; end $$`);
  assert.equal(snapshot(f), before);
  const receipt = await run(f.client().saveManualCycle(f.command));
  assert.deepEqual(await run(f.client().saveManualCycle(f.command)), receipt);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "1");
});

test("cancelled recurring Saves stay cancelled and never create a cycle or mandate revision", async (t) => {
  const f = await fixture(t, [patch]);
  const change = {
    ruleId: f.rule.ruleId,
    expectedRevision: f.command.input.expectedRevision,
    expectedStatus: "active",
    action: "pause",
  };
  const cases = [
    { cancel: "nest_cancel_recurring_save", save: "nest_save_recurring", input: f.rule },
    {
      cancel: "nest_cancel_recurring_state_save",
      save: "nest_save_recurring_state",
      input: change,
    },
    {
      cancel: "nest_cancel_recurring_state_save",
      save: "nest_save_recurring_resume",
      input: {
        ...change,
        expectedStatus: "paused",
        action: "resume",
        resumeFrom: f.rule.firstDueOn,
        firstDueOn: f.rule.firstDueOn,
      },
    },
    {
      cancel: "nest_cancel_recurring_cycle_save",
      save: "nest_save_variable_cycle",
      input: f.variableCommand.input,
    },
  ];
  const before = snapshot(f);
  for (const entry of cases) {
    assert.equal((await rpc(f, entry.cancel, 951)).status, 200);
    const result = await rpc(f, entry.save, 951, entry.input);
    assert.equal(result.status, 412, JSON.stringify(result));
    assert.equal(result.body.code, "PT412");
    assert.equal(snapshot(f), before);
  }
});

test("valid variable posting still records one balanced event and exact replay", async (t) => {
  const f = await fixture(t, [patch]);
  const receipt = await run(f.client().saveVariableCycle(f.variableCommand));
  assert.deepEqual(await run(f.client().saveVariableCycle(f.variableCommand)), receipt);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "2");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "1");
  assert.equal(f.db.sql("select sum(receivable_delta_cents) from public.ledger_entries"), "0");
  const before = snapshot(f);
  const result = await rpc(f, "nest_save_variable_cycle", 952, f.variableCommand.input);
  assert.equal(result.status, 412);
  assert.equal(snapshot(f), before);
});
