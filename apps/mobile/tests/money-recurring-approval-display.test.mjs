import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesRecurringContext } from "../src/money/recurring-approval-display.ts";
import { command, id } from "./money-recurring-save-fixture.mjs";
const rule = {
  ...command.rule,
  configuration: {
    ...command.rule.configuration,
    startDate: "2026-10-01",
    schedule: { kind: "monthly", dayOfMonth: 1 },
  },
  firstDueOn: "2026-10-01",
};
const approval = { rule };
const context = {
  ruleId: rule.ruleId,
  today: "2026-09-21",
  current: null,
  members: rule.configuration.allocations.map((share) => share.memberId),
};
test("confirmation requires fresh identity, revision, members, prospective time and uncovered cycle", () => {
  assert.equal(matchesRecurringContext(approval, { context }), true);
  assert.equal(matchesRecurringContext(approval, null), false);
  for (const patch of [
    { ruleId: id(999) },
    { today: "2026-10-02" },
    { members: [id(4), id(5)] },
    { current: { revision: id(7) } },
  ])
    assert.equal(matchesRecurringContext(approval, { context: { ...context, ...patch } }), false);
  const edit = { rule: { ...rule, expectedRevision: id(7) } };
  const current = {
    revision: id(7),
    status: "active",
    nextDueOn: "2026-10-01",
    coveredThrough: null,
  };
  assert.equal(matchesRecurringContext(edit, { context: { ...context, current } }), true);
  for (const patch of [
    { status: "cancelled" },
    { nextDueOn: "2026-09-20" },
    { coveredThrough: "2026-10-31" },
  ])
    assert.equal(
      matchesRecurringContext(edit, { context: { ...context, current: { ...current, ...patch } } }),
      false,
    );
});
