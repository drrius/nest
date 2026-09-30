import assert from "node:assert/strict";
import { test } from "node:test";
import {
  matchesRecurringContext,
  recurringApprovalActions,
  recurringApprovalText,
} from "../src/money/recurring-approval-display.ts";
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
test("approval controls require fresh online exact review, expiry and readable active category", () => {
  const proposal = {
    ...approval,
    operationId: id(600),
    status: "pending",
    expiresAt: "2026-10-02T12:00:00.000000Z",
  };
  const view = {
    approval: proposal,
    context: { context },
    active: true,
    online: true,
    fresh: true,
    busy: false,
    verify: false,
    attempt: null,
  };
  const now = Date.parse("2026-10-01T12:00:00Z");
  assert.equal(recurringApprovalActions(view, now).confirm, true);
  for (const patch of [
    { active: false },
    { online: false },
    { fresh: false },
    { busy: true },
    { verify: true },
  ]) {
    const actions = recurringApprovalActions({ ...view, ...patch }, now);
    assert.equal(actions.confirm, false);
    assert.equal(actions.deny, false);
    assert.equal(actions.retry, false);
  }
  const expiry = recurringApprovalActions(view, Date.parse(proposal.expiresAt));
  assert.equal(expiry.expired, true);
  assert.equal(expiry.confirm, false);
  assert.equal(expiry.deny, false);
  const staged = recurringApprovalActions({ ...view, attempt: { approved: true } }, now);
  assert.equal(staged.confirm, false);
  assert.equal(staged.deny, false);
  assert.equal(staged.retry, true);
  const categorized = {
    ...proposal,
    rule: {
      ...rule,
      configuration: { ...rule.configuration, categoryId: id(500), note: "Exact visible note" },
    },
  };
  for (const category of [
    null,
    { categoryId: id(501), archived: false },
    { categoryId: id(500), archived: true },
  ])
    assert.equal(matchesRecurringContext(categorized, { context, category }), false);
  const loaded = { context, category: { categoryId: id(500), name: "Household", archived: false } };
  assert.equal(matchesRecurringContext(categorized, loaded), true);
  const text = recurringApprovalText(categorized, loaded, id(1));
  assert.match(text, /Category: Household/);
  assert.match(text, /Exact visible note/);
  assert.match(text, /Scheduled posting is not active yet/);
  assert.match(recurringApprovalText(categorized, null, id(1)), /Category: Unavailable/);
});
