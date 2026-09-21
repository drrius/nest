import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesSettlementProposal } from "../../apps/api/src/money/settlement-proposal.ts";
import { id } from "../database/native-expense-helpers.mjs";
import { settlement as payload } from "../integration/settlement-api-fixture.mjs";
const member = { userId: id(1), householdId: id(10) };
const pending = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  approval: {
    id: id(100),
    operationId: id(101),
    settlement: payload(),
    status: "pending",
    expiresAt: "2026-09-21T12:00:00.000000Z",
    receipt: null,
  },
};
test("AI settlement receipt requires exact private pending proposal, never an invented posted outcome", () => {
  assert.equal(matchesSettlementProposal(payload(), pending, member), true);
  for (const value of [
    { ...pending, actorId: id(2) },
    { ...pending, householdId: id(20) },
    { ...pending, approval: { ...pending.approval, status: "approved" } },
    { ...pending, approval: { ...pending.approval, settlement: payload({ note: "Changed" }) } },
    { ...pending, approval: { ...pending.approval, status: "consumed" } },
  ])
    assert.equal(matchesSettlementProposal(payload(), value, member), false);
  const partner = "abcdefab-abcd-4abc-8abc-abcdefabcdef";
  const canonical = payload({
    payerId: partner,
  });
  const input = { ...canonical, payerId: partner.toUpperCase() };
  assert.equal(
    matchesSettlementProposal(
      input,
      { ...pending, approval: { ...pending.approval, settlement: canonical } },
      member,
    ),
    true,
  );
});
