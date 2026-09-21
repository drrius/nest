import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesRefundProposal } from "../../apps/api/src/money/refund-proposal.ts";
import { id } from "../database/native-expense-helpers.mjs";
import { refund as payload } from "../integration/refund-api-fixture.mjs";
const member = { userId: id(1), householdId: id(10) };
const pending = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  approval: {
    id: id(100),
    operationId: id(101),
    refund: payload(id(400)),
    status: "pending",
    expiresAt: "2026-09-21T12:00:00.000000Z",
    receipt: null,
  },
};
test("AI refund receipt requires exact private pending proposal, never an invented posted outcome", () => {
  assert.equal(matchesRefundProposal(payload(id(400)), pending, member), true);
  for (const value of [
    { ...pending, actorId: id(2) },
    { ...pending, householdId: id(20) },
    { ...pending, approval: { ...pending.approval, status: "approved" } },
    {
      ...pending,
      approval: { ...pending.approval, refund: payload(id(400), { note: "Changed" }) },
    },
    { ...pending, approval: { ...pending.approval, status: "consumed" } },
  ])
    assert.equal(matchesRefundProposal(payload(id(400)), value, member), false);
  const source = "abcdefab-abcd-4abc-8abc-abcdefabcdef";
  const canonical = payload(source);
  assert.equal(
    matchesRefundProposal(
      { ...canonical, sourceEventId: source.toUpperCase() },
      { ...pending, approval: { ...pending.approval, refund: canonical } },
      member,
    ),
    true,
  );
});
