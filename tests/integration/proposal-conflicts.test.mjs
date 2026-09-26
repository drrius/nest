import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, client, model, command, id } from "./meal-proposal-api-fixture.mjs";
import { ready, model as editModel } from "./meal-proposal-edit-api-fixture.mjs";

async function rpc(f, name, fields) {
  const response = await fetch(`${f.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
    body: JSON.stringify({ p_household: id(10), ...fields }),
  });
  return { status: response.status, body: await response.json() };
}
function state(f) {
  return f.db.sql(`select jsonb_build_object(
    'proposals',(select jsonb_agg(to_jsonb(p) order by proposal_id) from private.nest_meal_proposals p),
    'receipts',(select jsonb_agg(to_jsonb(r) order by operation_id) from private.nest_meal_proposal_receipts r),
    'edits',(select jsonb_agg(to_jsonb(e) order by operation_id) from private.nest_meal_proposal_edits e),
    'meals',(select jsonb_agg(to_jsonb(m) order by id) from public.meal_plan_entries m))`);
}
function changeWeek(f) {
  f.db.sql(`insert into public.meal_plan_entries(household_id,date,slot,title_snapshot)
    values('${id(10)}','2030-01-07','lunch','Concurrent meal')`);
}
test("stale approval, discard and edit leave the private preview and saved week unchanged", async (t) => {
  const f = await fixture(t),
    { input } = await ready(f);
  const before = state(f);
  const stale = { proposalId: input.proposalId, expectedRevision: "1" };
  for (const entry of [
    { name: "nest_approve_meal_proposal", input: stale },
    { name: "nest_discard_meal_proposal", input: stale },
    {
      name: "nest_begin_proposal_edit",
      input: { ...input, operationId: undefined, expectedRevision: "1" },
    },
  ]) {
    const result = await rpc(f, entry.name, { p_operation: id(899), p_input: entry.input });
    assert.equal(result.status, 412, JSON.stringify(result));
    assert.equal(result.body.code, "PT412");
    assert.equal(state(f), before);
  }
  f.db.sql(
    "update private.nest_meal_proposals set expires_at=clock_timestamp()-interval '1 second'",
  );
  const expired = state(f);
  const result = await rpc(f, "nest_approve_meal_proposal", {
    p_operation: id(899),
    p_input: { ...stale, expectedRevision: "2" },
  });
  assert.equal(result.status, 412);
  assert.equal(state(f), expired);
});
test("week changes during generation persist constraints_changed and replay without another model run", async (t) => {
  const f = await fixture(t);
  const provider = model((value, index) => {
    if (index === 2) changeWeek(f);
    return value;
  });
  const c = client(f, provider.instance);
  const response = await c("/generate", command());
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.envelope.proposal.failure, "constraints_changed");
  assert.equal(result.envelope.proposal.entries, null);
  assert.deepEqual(await (await c("/generate", command())).json(), result);
  assert.equal(provider.calls.length, 2);
  assert.equal(f.db.sql("select count(*) from public.meal_plan_entries"), "1");
});
test("week changes during suggestion replacement persist failure and retain the original preview", async (t) => {
  const f = await fixture(t),
    { input, envelope } = await ready(f);
  const provider = editModel((value, index) => {
    if (index === 2) changeWeek(f);
    return value;
  });
  const c = client(f, provider.instance);
  const response = await c("/edit", input);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, "failed");
  assert.equal(result.failure, "constraints_changed");
  assert.deepEqual(await (await c("/edit", input)).json(), result);
  assert.deepEqual(await (await c(`?proposalId=${input.proposalId}`)).json(), envelope);
  assert.equal(provider.calls.length, 2);
  assert.equal(f.db.sql("select count(*) from public.meal_plan_entries"), "1");
});
