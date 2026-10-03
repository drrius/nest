import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  LegacyConfirmationReceipt,
  LegacyConfirmationRecovery,
  SaveLegacyConfirmation,
} from "../../packages/contracts/src/legacy-draft-confirmation.ts";
import { LegacyDraftContext } from "../../packages/contracts/src/legacy-draft-dismissal.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const fixture = JSON.parse(
  readFileSync(
    new URL("../../apps/ios/Tests/Core/Fixtures/legacy-confirmation.json", import.meta.url),
    "utf8",
  ),
);
test("Swift legacy confirmation fixtures bind exact retained terms to command and immutable receipt", () => {
  for (const [key, schema] of [
    ["context", LegacyDraftContext],
    ["command", SaveLegacyConfirmation],
    ["receipt", LegacyConfirmationReceipt],
    ["recovery", LegacyConfirmationRecovery],
  ]) {
    assert.deepEqual(
      Schema.decodeUnknownSync(schema)(fixture[key], { onExcessProperty: "error" }),
      fixture[key],
    );
  }
  assert.equal(fixture.receipt.reviewed.draft.status, "pending");
  assert.equal(fixture.receipt.reviewed.draft.amountCentimes, "9007199254740991");
  assert.equal(fixture.receipt.reviewed.draft.updatedAt.value, "2026-01-01T10:00:00.123456Z");
  assert.equal(fixture.receipt.approvalId, null);
  assert.equal(fixture.receipt.input.expense.amountCentimes, "101");
  assert.equal(fixture.receipt.status, "posted");
});

test("legacy confirmation keeps unsupported old values but excludes linked, posted or shopping receipts", () => {
  const retained = structuredClone(fixture.context);
  retained.draft.amountCentimes = null;
  retained.draft.payerId = null;
  retained.draft.allocations = { kind: "needs_review", reason: "invalid_split" };
  retained.draft.occurredOn = { kind: "unsupported", value: "infinity", reason: "non_finite" };
  assert.equal(Schema.is(LegacyDraftContext)(retained), true);
  const receipt = { ...fixture.receipt, reviewed: retained };
  assert.equal(Schema.is(LegacyConfirmationReceipt)(receipt), true);
  for (const [key, value] of [
    ["status", "posted"],
    ["eventId", fixture.receipt.operationId],
    ["sourceKind", "shopping"],
  ]) {
    const changed = structuredClone(receipt);
    changed.reviewed.draft[key] = value;
    if (key === "sourceKind")
      changed.reviewed.draft.shoppingSessionId = fixture.receipt.operationId;
    assert.equal(Schema.is(LegacyConfirmationReceipt)(changed), false, key);
  }
  const privateReceipt = structuredClone(fixture.recovery);
  privateReceipt.receipt.approvalId = fixture.receipt.operationId;
  assert.equal(Schema.is(LegacyConfirmationRecovery)(privateReceipt), false);
});

test("legacy conversion excludes receipt attachments and separate receipt totals", () => {
  for (const [key, value] of [
    [
      "receiptPath",
      "00000000-0000-4000-8000-000000000010/receipts/00000000-0000-4000-8000-000000000999.jpg",
    ],
    ["receiptTotalCentimes", "101"],
  ]) {
    const command = structuredClone(fixture.command);
    command.input.expense[key] = value;
    assert.equal(Schema.is(SaveLegacyConfirmation)(command), false, key);
  }
});
