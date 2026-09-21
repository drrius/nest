import assert from "node:assert/strict";
import test from "node:test";
import { fixture, id, run } from "./recurring-manual-fixture.mjs";
import {
  manualContext,
  prepareManualConfirmation,
  manualConfirmationCurrent,
  manualConfirmationText,
  dueManualCycle,
} from "../../apps/mobile/src/money/recurring-manual-confirmation.ts";
const save = {
  active: true,
  online: true,
  busy: false,
  fresh: true,
  verify: false,
  attempt: null,
  result: null,
};
const ruleView = (value) => ({
  active: true,
  online: true,
  busy: false,
  verify: false,
  entry: { kind: "detail", value },
});
const sourceView = (value) => ({
  active: true,
  busy: false,
  access: "ready",
  source: "online",
  entry: { kind: "detail", value },
});
async function context(f) {
  const detail = await f.rpc("nest_money_detail", {
    p_household: id(10),
    p_event: f.command.input.sourceEventId,
  });
  const target = await run(f.client().recurringRule(f.rule.ruleId));
  return { detail, target, source: sourceView(detail), rule: ruleView(target) };
}
test("native manual review links only the selected source and cycle with no financial posting", async (t) => {
  const f = await fixture(t),
    c = await context(f);
  const reviewed = prepareManualConfirmation(manualContext(c.source, c.rule, save), id(700));
  assert.deepEqual(reviewed.command, f.command);
  const text = manualConfirmationText(reviewed, id(1));
  for (const value of [
    c.detail.event.description,
    c.detail.event.eventId,
    c.target.rule.ruleId,
    c.detail.note,
    "Variable amount and split",
    "No expense, payment or balance change",
  ])
    assert.ok(text.includes(value));
  assert.equal(manualConfirmationCurrent(reviewed, manualContext(c.source, c.rule, save)), true);
  assert.equal(
    manualConfirmationCurrent(reviewed, manualContext(sourceView({ ...c.detail }), c.rule, save)),
    false,
  );
  assert.equal(
    manualConfirmationCurrent(reviewed, manualContext(c.source, ruleView({ ...c.target }), save)),
    false,
  );
  const result = await run(f.client().saveManualCycle(reviewed.command));
  assert.deepEqual(result.linkedExpense, c.detail);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "1");
  const updated = await run(f.client().recurringRule(f.rule.ruleId));
  assert.equal(manualContext(c.source, ruleView(updated), save), null);
});
test("manual confirmation rejects stale/offline sources, covered rules and pending requests", async (t) => {
  const f = await fixture(t),
    c = await context(f);
  for (const patch of [
    { active: false },
    { busy: true },
    { access: "verify" },
    { source: "saved" },
    { source: "previous" },
  ])
    assert.equal(manualContext({ ...c.source, ...patch }, c.rule, save), null);
  for (const patch of [{ active: false }, { busy: true }, { online: false }, { verify: true }])
    assert.equal(manualContext(c.source, { ...c.rule, ...patch }, save), null);
  for (const patch of [
    { active: false },
    { busy: true },
    { online: false },
    { fresh: false },
    { verify: true },
    { attempt: { command: f.command, action: "save" } },
    { result: { status: "cancelled" } },
  ])
    assert.equal(manualContext(c.source, c.rule, { ...save, ...patch }), null);
  for (const patch of [
    { householdId: id(11) },
    { reversedById: id(800) },
    { event: { ...c.detail.event, kind: "settlement" } },
    { event: { ...c.detail.event, occurredOn: "2000-01-01" } },
  ])
    assert.equal(manualContext(sourceView({ ...c.detail, ...patch }), c.rule, save), null);
  const r = c.target.rule;
  for (const patch of [
    { status: "paused" },
    { status: "cancelled" },
    { nextDueOn: null },
    { coveredThrough: c.target.today },
  ])
    assert.equal(dueManualCycle({ ...r, ...patch }, c.target.today), null);
  const fixed = {
    ...r,
    configuration: {
      ...r.configuration,
      mode: "fixed",
      amountCentimes: "900",
      allocations: [
        { memberId: id(1), centimes: "900" },
        { memberId: id(2), centimes: "0" },
      ],
      payerId: id(2),
    },
  };
  const differing = manualContext(c.source, ruleView({ ...c.target, rule: fixed }), save);
  assert.ok(differing);
  const text = manualConfirmationText(differing, id(1));
  assert.ok(text.includes("Configured amount:"));
  assert.ok(text.includes("Configured payer: Other household member"));
  assert.ok(text.includes("even if its amount, payer or split differs"));
});
