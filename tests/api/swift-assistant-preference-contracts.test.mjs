import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import {
  AssistantInputs,
  AssistantReceipts,
} from "../../packages/contracts/src/assistant-actions.ts";

const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const fixtures = JSON.parse(
  await readFile(
    new URL(
      "../../apps/ios/Tests/Core/Fixtures/assistant-preference-actions.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
test("Swift preference action fixtures match strict actual AI inputs and issued receipts", () => {
  for (const fixture of fixtures) {
    const action = fixture.type.slice(5);
    assert.deepEqual(
      Schema.decodeUnknownSync(AssistantInputs[action])(fixture.input, {
        onExcessProperty: "error",
      }),
      fixture.input,
    );
    assert.deepEqual(
      Schema.decodeUnknownSync(AssistantReceipts[action])(fixture.receipt, {
        onExcessProperty: "error",
      }),
      fixture.receipt,
    );
  }
});
