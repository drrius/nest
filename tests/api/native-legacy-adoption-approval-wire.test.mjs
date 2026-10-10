import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  DecideLegacyAdoption,
  LegacyAdoptionApprovalEnvelope,
  LegacyAdoptionApprovalContext,
} from "../../packages/contracts/src/legacy-adoption-approval.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../apps/ios/Tests/Core/Fixtures/assistant-legacy-adoption-approval.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
test("Swift private rule-adoption proposal, decision and owner context match strict Effect schemas", () => {
  for (const [key, schema] of [
    ["envelope", LegacyAdoptionApprovalEnvelope],
    ["context", LegacyAdoptionApprovalContext],
    ["decision", DecideLegacyAdoption],
  ]) {
    assert.deepEqual(
      Schema.decodeUnknownSync(schema)(fixture[key], { onExcessProperty: "error" }),
      fixture[key],
    );
  }
  assert.deepEqual(fixture.assistant.input, {
    ruleId: fixture.decision.input.ruleId,
    configuration: fixture.decision.input.configuration,
  });
  const consumed = structuredClone(fixture.envelope);
  consumed.approval.status = "consumed";
  consumed.approval.receipt = fixture.receipt;
  assert.equal(Schema.is(LegacyAdoptionApprovalEnvelope)(consumed), true);
  consumed.approval.receipt.approvalId = fixture.receipt.operationId;
  assert.equal(Schema.is(LegacyAdoptionApprovalEnvelope)(consumed), false);
});

test("a changed raw review remains representable but never rewrites the original approval input", () => {
  const changed = structuredClone(fixture.context);
  changed.review.reviewToken = "f".repeat(64);
  assert.equal(Schema.is(LegacyAdoptionApprovalContext)(changed), true);
  assert.notEqual(changed.review.reviewToken, changed.input.reviewToken);
  assert.equal(changed.input.reviewToken, fixture.decision.input.reviewToken);
});
