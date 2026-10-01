import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { RecurringStateApprovalEnvelope } from "../../packages/contracts/src/recurring-state-approval.ts";
import { RecurringStateInput } from "../../packages/contracts/src/recurring-state.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const parts = JSON.parse(
  readFileSync(
    new URL(
      "../../apps/ios/Tests/Core/Fixtures/assistant-recurring-state-approval.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
test("SwiftUI pause/cancel wire fixtures satisfy the exact Effect input and approval schemas", () => {
  assert.equal(parts.length, 2);
  for (const part of parts) {
    const command = Schema.decodeUnknownSync(RecurringStateInput)(part.input, {
      onExcessProperty: "error",
    });
    const value = Schema.decodeUnknownSync(RecurringStateApprovalEnvelope)(part.output.value, {
      onExcessProperty: "error",
    });
    assert.deepEqual(value.approval.change, command);
    assert.equal(value.approval.status, "pending");
    assert.equal(value.approval.receipt, null);
    assert.equal(part.type, "tool-proposeRecurringState");
    assert.equal(part.state, "output-available");
    assert.equal(part.output.ok, true);
  }
  assert.deepEqual(
    parts.map((part) => part.input.action),
    ["pause", "cancel"],
  );
});
