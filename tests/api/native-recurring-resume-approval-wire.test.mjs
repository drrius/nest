import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { RecurringResumeApprovalEnvelope } from "../../packages/contracts/src/recurring-resume-approval.ts";
import { RecurringResumeInput } from "../../packages/contracts/src/recurring-resume.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const parts = JSON.parse(
  readFileSync(
    new URL(
      "../../apps/ios/Tests/Core/Fixtures/assistant-recurring-resume-approval.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
test("SwiftUI resume wire fixtures satisfy the exact Effect input and approval schemas", () => {
  assert.equal(parts.length, 1);
  for (const part of parts) {
    const command = Schema.decodeUnknownSync(RecurringResumeInput)(part.input, {
      onExcessProperty: "error",
    });
    const value = Schema.decodeUnknownSync(RecurringResumeApprovalEnvelope)(part.output.value, {
      onExcessProperty: "error",
    });
    assert.deepEqual(value.approval.change, command);
    assert.equal(value.approval.status, "pending");
    assert.equal(value.approval.receipt, null);
    assert.equal(part.type, "tool-proposeRecurringResume");
    assert.equal(part.state, "output-available");
    assert.equal(part.output.ok, true);
  }
  assert.equal(parts[0].input.action, "resume");
  assert.equal(parts[0].output.value.approval.reviewedOn, "2026-10-01");
});
