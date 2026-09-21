import assert from "node:assert/strict";
import { test } from "node:test";
import { input, id } from "../../../tests/api/recurring-transport-fixture.mjs";
import { stateConfirmationText } from "../src/money/recurring-state-confirmation.ts";
import { recurringStateApprovalText } from "../src/money/recurring-state-approval-display.ts";
import { formatChf } from "../src/money/format.ts";
test("same-name recurring stop confirmations disclose distinct financial configurations", () => {
  const rule = {
    ruleId: id(100),
    revision: id(101),
    status: "active",
    configuration: { ...input().configuration, description: "Rent" },
    nextDueOn: "2027-01-15",
    coveredThrough: "2026-12-31",
  };
  const other = {
    ...rule,
    ruleId: id(102),
    configuration: {
      ...rule.configuration,
      amountCentimes: "2200",
      allocations: rule.configuration.allocations.map((share) => ({ ...share, centimes: "1100" })),
      payerId: id(2),
      schedule: { kind: "weekly", weekday: 2 },
      startDate: "2027-01-01",
      note: "Garage",
    },
    nextDueOn: "2027-01-05",
  };
  const proposal = { change: { ruleId: rule.ruleId, expectedStatus: "active", action: "pause" } };
  const first = recurringStateApprovalText(proposal, rule, rule.configuration.payerId);
  const second = recurringStateApprovalText(
    { change: { ...proposal.change, ruleId: other.ruleId } },
    other,
    rule.configuration.payerId,
  );
  assert.notEqual(first, second);
  assert.match(first, /Payer: You/);
  assert.match(first, /Your share/);
  assert.ok(first.includes(formatChf(rule.configuration.amountCentimes)));
  assert.ok(second.includes(formatChf("2200")));
  assert.match(second, /Tuesday/);
  assert.match(second, /2027-01-05/);
  assert.match(second, /Garage/);
  assert.match(second, /Other household member/);
  assert.match(stateConfirmationText(other, "cancel", rule.configuration.payerId), /Tuesday/);
  const variable = {
    ...rule,
    configuration: {
      ...rule.configuration,
      mode: "variable",
      amountCentimes: null,
      allocations: null,
    },
  };
  assert.match(
    stateConfirmationText(variable, "pause", id(1)),
    /Variable amount and split confirmed each cycle/,
  );
});
