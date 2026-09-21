import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { matchesAssistantReceipt } from "../../apps/api/src/assistant/matches-receipt.ts";
import {
  AssistantInputs,
  AssistantReceipts,
} from "../../packages/contracts/src/assistant-actions.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = require("effect/Schema");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const member = { userId: id(1), householdId: id(10) };
const input = { weekStart: "2030-01-07", expectedWeekRevision: "0", familiarOnly: false };
const receipt = {
  version: 1,
  actorId: member.userId,
  householdId: member.householdId,
  operationId: id(800),
  proposalId: id(900),
  revision: "1",
  ...input,
};
test("assistant generation binds original request and owner and exposes no approval authority", () => {
  assert.equal(matchesAssistantReceipt("generateMealProposal", input, receipt, member), true);
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { weekStart: "2030-01-14" },
    { expectedWeekRevision: "1" },
    { familiarOnly: true },
  ])
    assert.equal(
      matchesAssistantReceipt("generateMealProposal", input, { ...receipt, ...patch }, member),
      false,
    );
  for (const patch of [{ operationId: id(800) }, { approved: true }, { actorId: id(1) }])
    assert.throws(() =>
      Schema.decodeUnknownSync(AssistantInputs.generateMealProposal)(
        { ...input, ...patch },
        { onExcessProperty: "error" },
      ),
    );
  assert.equal(AssistantInputs.approveMealProposal, undefined);
});
test("assistant edit receipt binds exact entry, proposal, action and saved library revision", () => {
  const input = {
    proposalId: id(900),
    entryId: id(950),
    expectedRevision: "2",
    definitionId: id(200),
    expectedLibraryRevision: "3",
  };
  const receipt = {
    version: 1,
    actorId: member.userId,
    householdId: member.householdId,
    command: { ...input, action: "choose", operationId: id(810) },
    expiresAt: 2000000000000,
    status: "pending",
    failure: null,
    receipt: null,
  };
  assert.equal(matchesAssistantReceipt("chooseProposalRecipe", input, receipt, member), true);
  for (const patch of [
    { proposalId: id(901) },
    { entryId: id(951) },
    { expectedRevision: "3" },
    { definitionId: id(201) },
    { expectedLibraryRevision: "4" },
  ])
    assert.equal(
      matchesAssistantReceipt(
        "chooseProposalRecipe",
        input,
        { ...receipt, command: { ...receipt.command, ...patch } },
        member,
      ),
      false,
    );
  assert.equal(matchesAssistantReceipt("replaceProposalMeal", input, receipt, member), false);
  assert.equal(
    matchesAssistantReceipt("chooseProposalRecipe", input, { ...receipt, actorId: id(2) }, member),
    false,
  );
  assert.equal(
    Schema.is(AssistantReceipts.chooseProposalRecipe)({
      ...receipt,
      status: "failed",
      failure: "unavailable",
    }),
    false,
  );
});
test("assistant discard receipt cannot substitute another proposal or displayed revision", () => {
  const input = { proposalId: id(900), expectedRevision: "2" };
  const receipt = {
    version: 1,
    actorId: member.userId,
    householdId: member.householdId,
    operationId: id(810),
    proposalId: id(900),
    previousRevision: "2",
    revision: "3",
  };
  assert.equal(matchesAssistantReceipt("discardMealProposal", input, receipt, member), true);
  for (const patch of [
    { proposalId: id(901) },
    { actorId: id(2) },
    { householdId: id(20) },
    { previousRevision: "3", revision: "4" },
  ])
    assert.equal(
      matchesAssistantReceipt("discardMealProposal", input, { ...receipt, ...patch }, member),
      false,
    );
});
