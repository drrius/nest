import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  ManualCycleReceipt,
  SaveManualCycle,
} from "../../packages/contracts/src/recurring-manual.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
test("SwiftUI manual linkage fixture uses exact Effect receipt and command schemas", () => {
  const wire = JSON.parse(
    readFileSync(
      new URL("../../apps/ios/Tests/Core/Fixtures/manual-cycle-receipt.json", import.meta.url),
      "utf8",
    ),
  );
  const receipt = Schema.decodeUnknownSync(ManualCycleReceipt)(wire, { onExcessProperty: "error" });
  const command = Schema.decodeUnknownSync(SaveManualCycle)(
    { operationId: receipt.operationId, input: receipt.input },
    { onExcessProperty: "error" },
  );
  assert.deepEqual(command.input, receipt.input);
  assert.equal(receipt.eventId, receipt.linkedExpense.event.eventId);
  assert.equal(receipt.linkedExpense.event.amountCentimes, "101");
  assert.equal(receipt.configuration.amountCentimes, "990");
  assert.notEqual(receipt.linkedExpense.event.payerId, receipt.configuration.payerId);
});
