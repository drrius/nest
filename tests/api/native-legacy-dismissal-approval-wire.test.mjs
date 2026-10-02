import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  DecideLegacyDismissal,
  LegacyDismissalApprovalEnvelope,
  LegacyDismissalContext,
} from "../../packages/contracts/src/legacy-dismissal-approval.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../apps/ios/Tests/Core/Fixtures/assistant-legacy-dismissal-approval.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
test("Swift private dismissal proposal, decision and owner context match strict Effect schemas", () => {
  for (const [key, schema] of [
    ["envelope", LegacyDismissalApprovalEnvelope],
    ["context", LegacyDismissalContext],
    ["decision", DecideLegacyDismissal],
  ]) {
    assert.deepEqual(
      Schema.decodeUnknownSync(schema)(fixture[key], { onExcessProperty: "error" }),
      fixture[key],
    );
  }
  assert.deepEqual(fixture.assistant.input, { draftId: fixture.decision.input.draftId });
  const consumed = structuredClone(fixture.envelope);
  consumed.approval.status = "consumed";
  consumed.approval.receipt = fixture.receipt;
  assert.equal(Schema.is(LegacyDismissalApprovalEnvelope)(consumed), true);
  consumed.approval.receipt.approvalId = fixture.receipt.operationId;
  assert.equal(Schema.is(LegacyDismissalApprovalEnvelope)(consumed), false);
});

test("a changed raw review remains representable but never rewrites the original approval input", () => {
  const changed = structuredClone(fixture.context);
  changed.review.reviewToken = "f".repeat(64);
  assert.equal(Schema.is(LegacyDismissalContext)(changed), true);
  assert.notEqual(changed.review.reviewToken, changed.input.reviewToken);
  assert.equal(changed.input.reviewToken, fixture.decision.input.reviewToken);
});
