import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture as chore, id } from "./chore-reminder-fixture.mjs";
import { fixture as meal } from "./meal-reminder-fixture.mjs";
import { fixture as grocery } from "./grocery-reminder-fixture.mjs";
import { fixture as recurring } from "./recurring-reminder-fixture.mjs";

async function save(f, kind, input, operation = id(2000)) {
  const response = await fetch(`${f.config.url}/rest/v1/rpc/nest_save_${kind}_reminder`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
    body: JSON.stringify({ p_household: id(10), p_operation: operation, p_input: input }),
  });
  return { status: response.status, body: await response.json() };
}
function state(f, kind) {
  return f.db.sql(`select jsonb_build_object(
    'reminders',(select jsonb_agg(to_jsonb(r) order by revision) from public.nest_${kind}_reminders r),
    'operations',(select jsonb_agg(to_jsonb(o) order by operation_id) from private.nest_${kind}_reminder_operations o))`);
}
const cases = [
  {
    kind: "chore",
    fixture: chore,
    key: "occurrenceId",
    stale: { expectedItemRevision: "f".repeat(64) },
  },
  { kind: "meal", fixture: meal, key: "entryId", stale: { expectedItemRevision: "f".repeat(64) } },
  { kind: "grocery", fixture: grocery, key: "itemId", stale: { expectedItemVersion: "99" } },
  {
    kind: "recurring",
    fixture: recurring,
    key: "ruleId",
    stale: { expectedRuleRevision: id(999) },
  },
];
for (const entry of cases) {
  test(`${entry.kind} reminder rejects stale source and reminder versions without changing consent`, async (t) => {
    const f = await entry.fixture(t),
      before = state(f, entry.kind);
    for (const patch of [entry.stale, { [entry.key]: id(999) }]) {
      const result = await save(f, entry.kind, { ...f.input, ...patch });
      assert.equal(result.status, 412, JSON.stringify(result));
      assert.equal(result.body.code, "PT412");
      assert.equal(state(f, entry.kind), before);
    }
    const saved = await save(f, entry.kind, f.input);
    assert.equal(saved.status, 200, JSON.stringify(saved));
    const after = state(f, entry.kind);
    const stale = await save(f, entry.kind, f.input, id(2001));
    assert.equal(stale.status, 412, JSON.stringify(stale));
    assert.equal(state(f, entry.kind), after);
    assert.deepEqual(await save(f, entry.kind, f.input), saved);
    assert.equal(state(f, entry.kind), after);
    const response = await fetch(`${f.url}/v1/${entry.kind}-reminders/save`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${f.bearer}`,
        "x-nest-household": id(10),
        "content-type": "application/json",
      },
      body: JSON.stringify({ ...f.input, operationId: id(2002) }),
    });
    assert.equal(response.status, 409);
    assert.equal(state(f, entry.kind), after);
  });
}
