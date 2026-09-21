import assert from "node:assert/strict";
import test from "node:test";
import { fixture, id, run } from "./recurring-variable-fixture.mjs";
import {
  prepareVariableConfirmation,
  variableConfirmationCurrent,
  variableConfirmationText,
} from "../../apps/mobile/src/money/recurring-variable-confirmation.ts";
import { dueVariableCycle } from "../../apps/mobile/src/money/recurring-variable-draft.ts";
const members = [
  { actorId: id(1), displayName: "Alex", centimes: "0" },
  { actorId: id(2), displayName: "Sam", centimes: "0" },
];
const draft = {
  amount: "1.01",
  split: "equal",
  firstExact: "",
  secondExact: "",
  firstPercent: "50",
};
const save = {
  active: true,
  online: true,
  busy: false,
  fresh: true,
  verify: false,
  attempt: null,
  result: null,
};
function read(detail) {
  return {
    active: true,
    online: true,
    busy: false,
    verify: false,
    entry: { kind: "detail", value: detail },
  };
}
test("native variable review binds exact current financial input and posts only the reviewed cycle", async (t) => {
  const f = await fixture(t);
  const detail = await run(f.client().recurringRule(f.rule.ruleId));
  const context = { read: read(detail), save };
  const expected = prepareVariableConfirmation(context, draft, members, id(700));
  assert.equal(expected.ok, true);
  assert.deepEqual(expected.command, f.command);
  assert.equal(variableConfirmationCurrent(expected, context.read, save), true);
  for (const changed of [
    { ...context.read, active: false },
    { ...context.read, online: false },
    { ...context.read, busy: true },
    read({ ...detail }),
    { ...context.read, verify: true },
  ])
    assert.equal(variableConfirmationCurrent(expected, changed, save), false);
  for (const changed of [
    { ...save, busy: true },
    { ...save, fresh: false },
    { ...save, online: false },
    { ...save, attempt: { command: expected.command, action: "save" } },
  ])
    assert.equal(variableConfirmationCurrent(expected, context.read, changed), false);
  const text = variableConfirmationText(expected, { members, categories: { categories: [] } });
  for (const value of [
    detail.rule.ruleId,
    "Alex",
    "Sam",
    "CHF 1.01",
    detail.rule.nextDueOn,
    "cycle only",
    "does not transfer money",
  ])
    assert.ok(text.includes(value), value);
  const receipt = await run(f.client().saveVariableCycle(expected.command));
  assert.deepEqual(receipt.expense, expected.expense);
  const after = await run(f.client().recurringRule(f.rule.ruleId));
  assert.equal(
    prepareVariableConfirmation({ ...context, read: read(after) }, draft, members, id(701)).ok,
    false,
  );
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "1");
});
test("variable draft reuses centime-safe equal, exact and percentage parsing without changing the mandate", async (t) => {
  const f = await fixture(t);
  const detail = await run(f.client().recurringRule(f.rule.ruleId));
  const context = { read: read(detail), save };
  for (const { fields, shares } of [
    { fields: { split: "equal" }, shares: ["51", "50"] },
    { fields: { amount: "0", split: "equal" }, shares: ["0", "0"] },
    { fields: { split: "exact", firstExact: "0.01", secondExact: "1.00" }, shares: ["1", "100"] },
    { fields: { split: "percentage", firstPercent: "0" }, shares: ["0", "101"] },
  ]) {
    const result = prepareVariableConfirmation(context, { ...draft, ...fields }, members, id(700));
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.command.input.allocations.map((v) => v.centimes),
      shares,
    );
    assert.equal(result.expense.payerId, detail.rule.configuration.payerId);
    assert.equal(result.expense.note, detail.rule.configuration.note);
  }
  for (const fields of [
    { amount: "-1" },
    { amount: "1.001" },
    { amount: "1e2" },
    { split: "exact", firstExact: "1", secondExact: "1" },
    { split: "percentage", firstPercent: "100.01" },
  ])
    assert.equal(
      prepareVariableConfirmation(context, { ...draft, ...fields }, members, id(700)).ok,
      false,
    );
  assert.equal(
    prepareVariableConfirmation(
      context,
      draft,
      [members[0], { ...members[1], actorId: id(1) }],
      id(700),
    ).ok,
    false,
  );
  for (const rule of [
    { ...detail.rule, status: "paused" },
    { ...detail.rule, coveredThrough: detail.rule.nextDueOn },
    { ...detail.rule, nextDueOn: null },
  ])
    assert.equal(dueVariableCycle(rule, detail.today), null);
  assert.equal(dueVariableCycle(detail.rule, "2000-01-01"), null);
  const resumed = { ...detail.rule, nextDueOn: "2099-01-" + detail.rule.nextDueOn.slice(8) };
  assert.equal(dueVariableCycle(resumed, "2099-12-31").dueOn, resumed.nextDueOn);
  const retained = {
    ...detail,
    rule: {
      ...detail.rule,
      configuration: {
        ...detail.rule.configuration,
        description: "  Water  ",
        note: "  Meter reading  ",
      },
    },
  };
  const exact = prepareVariableConfirmation(
    { ...context, read: read(retained) },
    draft,
    members,
    id(700),
  );
  assert.equal(exact.expense.description, retained.rule.configuration.description);
  assert.equal(exact.expense.note, retained.rule.configuration.note);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
