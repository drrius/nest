import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesExpenseProposal } from "../../apps/api/src/money/expense-proposal.ts";
import { payload, id } from "../database/native-expense-helpers.mjs";
const member = { userId: id(1), householdId: id(10) };
const pending = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  approval: {
    id: id(100),
    operationId: id(101),
    expense: payload(),
    status: "pending",
    expiresAt: "2026-09-21T12:00:00.000000Z",
    receipt: null,
  },
};
test("AI expense receipt requires exact private pending proposal, never an invented posted outcome", () => {
  assert.equal(matchesExpenseProposal(payload(), pending, member), true);
  for (const value of [
    { ...pending, actorId: id(2) },
    { ...pending, householdId: id(20) },
    { ...pending, approval: { ...pending.approval, status: "approved" } },
    { ...pending, approval: { ...pending.approval, expense: payload({ note: "Changed" }) } },
    { ...pending, approval: { ...pending.approval, status: "consumed" } },
  ])
    assert.equal(matchesExpenseProposal(payload(), value, member), false);
  const partner = "abcdefab-abcd-4abc-8abc-abcdefabcdef";
  const canonical = payload({
    payerId: partner,
    allocations: [
      { memberId: partner, centimes: "51" },
      { memberId: id(1), centimes: "50" },
    ],
  });
  const input = { ...canonical, payerId: partner.toUpperCase() };
  assert.equal(
    matchesExpenseProposal(
      input,
      { ...pending, approval: { ...pending.approval, expense: canonical } },
      member,
    ),
    true,
  );
});
