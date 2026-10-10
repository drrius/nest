import assert from "node:assert/strict";
import { test } from "node:test";
import { initialRecurringDraft } from "../src/money/recurring-draft.ts";
import {
  prepareRecurringConfirmation,
  recurringConfirmationGuard,
  recurringConfirmationText,
  recurringEntryEnabled,
} from "../src/money/recurring-confirmation.ts";
import { command, account, id } from "./money-recurring-save-fixture.mjs";
const context = {
  ruleId: command.rule.ruleId,
  today: "2026-09-21",
  current: null,
  members: command.rule.configuration.allocations.map((share) => share.memberId),
};
const draft = {
  ...initialRecurringDraft(account.actor, context.today),
  description: "Rent",
  mode: "fixed",
  amount: "1.01",
};
test("preview refuses unseen revision or membership changes instead of rebinding old edits", () => {
  assert.equal(prepareRecurringConfirmation(draft, context, context, id(100)).ok, true);
  assert.equal(
    prepareRecurringConfirmation(
      draft,
      { ...context, current: { revision: id(88) } },
      context,
      id(100),
    ).ok,
    false,
  );
  assert.equal(
    prepareRecurringConfirmation(
      draft,
      { ...context, members: [...context.members].reverse() },
      context,
      id(100),
    ).ok,
    false,
  );
  assert.equal(
    prepareRecurringConfirmation(draft, { ...context, ruleId: id(89) }, context, id(100)).ok,
    false,
  );
});
test("confirmation captures exact input, is single use and cannot survive invalidation or a newer preview", () => {
  const guard = recurringConfirmationGuard(),
    input = structuredClone(command);
  const first = guard.prepare(input);
  input.rule.configuration.description = "Changed after preview";
  assert.equal(
    first.command.rule.configuration.description,
    command.rule.configuration.description,
  );
  guard.invalidate();
  assert.equal(first.consume(), false);
  const second = guard.prepare(command),
    third = guard.prepare(command);
  assert.equal(second.consume(), false);
  assert.equal(third.consume(), true);
  assert.equal(third.consume(), false);
});
test("confirmation discloses exact amount, prospective date and unfinished posting without enabling stale Saves", () => {
  const parsed = prepareRecurringConfirmation(draft, context, context, id(100));
  const text = recurringConfirmationText(parsed.command, account.actor);
  assert.match(text, /CHF 1\.01/);
  assert.ok(text.includes(parsed.command.rule.firstDueOn));
  assert.match(text, /Scheduled posting is not active yet/);
  const view = {
    active: true,
    online: true,
    fresh: true,
    busy: false,
    verify: false,
    attempt: null,
    result: null,
  };
  assert.equal(recurringEntryEnabled(view), true);
  for (const patch of [
    { active: false },
    { online: false },
    { fresh: false },
    { busy: true },
    { verify: true },
    { attempt: {} },
    { result: {} },
  ])
    assert.equal(recurringEntryEnabled({ ...view, ...patch }), false);
});
