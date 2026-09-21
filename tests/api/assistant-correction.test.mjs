import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesCorrectionProposal } from "../../apps/api/src/money/correction-proposal.ts";
import { id } from "../database/native-expense-helpers.mjs";
import { correction as payload } from "../integration/correction-api-fixture.mjs";
const member = { userId: id(1), householdId: id(10) };
const pending = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  approval: {
    id: id(100),
    operationId: id(101),
    correction: payload(id(400)),
    status: "pending",
    expiresAt: "2026-09-21T12:00:00.000000Z",
    receipt: null,
  },
};
test("AI correction receipt requires exact private pending proposal, never an invented posted outcome", () => {
  assert.equal(matchesCorrectionProposal(payload(id(400)), pending, member), true);
  for (const value of [
    { ...pending, actorId: id(2) },
    { ...pending, householdId: id(20) },
    { ...pending, approval: { ...pending.approval, status: "approved" } },
    {
      ...pending,
      approval: {
        ...pending.approval,
        correction: payload(id(400), { expectedReversalId: id(999) }),
      },
    },
    { ...pending, approval: { ...pending.approval, status: "consumed" } },
  ])
    assert.equal(matchesCorrectionProposal(payload(id(400)), value, member), false);
  const source = "abcdefab-abcd-4abc-8abc-abcdefabcdef";
  const canonical = payload(source);
  assert.equal(
    matchesCorrectionProposal(
      { ...canonical, sourceEventId: source.toUpperCase() },
      { ...pending, approval: { ...pending.approval, correction: canonical } },
      member,
    ),
    true,
  );
});
