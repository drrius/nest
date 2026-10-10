import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  LegacyAdoptionReceipt,
  LegacyAdoptionRecovery,
  SaveLegacyAdoption,
} from "../../packages/contracts/src/legacy-adoption-command.ts";
import { LegacyAdoptionContext } from "../../packages/contracts/src/legacy-adoption.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const fixture = JSON.parse(
  readFileSync(
    new URL("../../apps/ios/Tests/Core/Fixtures/legacy-adoption.json", import.meta.url),
    "utf8",
  ),
);
test("Swift legacy adoption fixtures preserve original rules and explicit prospective mandate", () => {
  for (const [key, schema] of [
    ["context", LegacyAdoptionContext],
    ["command", SaveLegacyAdoption],
    ["receipt", LegacyAdoptionReceipt],
    ["recovery", LegacyAdoptionRecovery],
  ]) {
    assert.deepEqual(
      Schema.decodeUnknownSync(schema)(fixture[key], { onExcessProperty: "error" }),
      fixture[key],
    );
  }
  assert.equal(fixture.context.rule.active, true);
  assert.equal(fixture.context.rule.amountCentimes, "9007199254740991");
  assert.equal(fixture.command.input.configuration.amountCentimes, "101");
  assert.equal(fixture.command.input.configuration.mode, "fixed");
  assert.equal(fixture.command.input.configuration.startDate, "2026-10-03");
  assert.equal(fixture.command.input.firstDueOn, "2026-10-05");
  assert.equal(fixture.receipt.approvalId, null);
});

test("adoption context refuses contradictory blockers and receipts for blocked source", () => {
  for (const blockers of [
    ["pending_drafts"],
    ["already_adopted"],
    ["unreconciled_history"],
    ["pending_drafts", "pending_drafts"],
  ]) {
    const context = { ...fixture.context, blockers };
    assert.equal(Schema.is(LegacyAdoptionContext)(context), false);
    assert.equal(
      Schema.is(LegacyAdoptionReceipt)({ ...fixture.receipt, reviewed: context }),
      false,
    );
  }
  const blocked = structuredClone(fixture.context);
  blocked.blockers = ["pending_drafts"];
  blocked.rule.drafts.pending = "1";
  assert.equal(Schema.is(LegacyAdoptionContext)(blocked), true);
  assert.equal(Schema.is(LegacyAdoptionReceipt)({ ...fixture.receipt, reviewed: blocked }), false);
  const privateRecovery = structuredClone(fixture.recovery);
  privateRecovery.receipt.approvalId = fixture.receipt.operationId;
  assert.equal(Schema.is(LegacyAdoptionRecovery)(privateRecovery), false);
});
