import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ManualCycleApprovalEnvelope } from "../../packages/contracts/src/recurring-manual-approval.ts";
import { ManualCycleInput } from "../../packages/contracts/src/recurring-manual.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const parts = JSON.parse(
  readFileSync(
    new URL(
      "../../apps/ios/Tests/Core/Fixtures/assistant-manual-cycle-approval.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
test("SwiftUI manual cycle wire fixtures satisfy the exact Effect input and approval schemas", () => {
  assert.equal(parts.length, 1);
  for (const part of parts) {
    const command = Schema.decodeUnknownSync(ManualCycleInput)(part.input, {
      onExcessProperty: "error",
    });
    const value = Schema.decodeUnknownSync(ManualCycleApprovalEnvelope)(part.output.value, {
      onExcessProperty: "error",
    });
    assert.deepEqual(value.approval.input, command);
    assert.equal(value.approval.status, "pending");
    assert.equal(value.approval.receipt, null);
    assert.equal(part.type, "tool-proposeManualCycle");
    assert.equal(part.state, "output-available");
    assert.equal(part.output.ok, true);
  }
  assert.deepEqual(
    parts.map((part) => part.input.dueOn),
    ["2026-10-01"],
  );
});
