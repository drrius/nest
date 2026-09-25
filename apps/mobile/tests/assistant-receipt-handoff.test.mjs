import assert from "node:assert/strict";
import test from "node:test";
import { actionResult } from "../src/assistant/action-result.ts";

for (const [tool, screen, label] of [
  ["openReceiptUploads", "receipt-uploads", "Review receipt uploads on your iPhone"],
  ["openReceiptExpense", "expense-entry", "Choose a receipt and review an expense on your iPhone"],
  [
    "openGroceryReceiptExpense",
    "grocery-expense",
    "Choose a receipt and review a grocery expense on your iPhone",
  ],
])
  test(`${tool} binds its successful handoff to the matching native route`, () => {
    const part = {
      type: `tool-${tool}`,
      state: "output-available",
      output: { ok: true, value: { kind: "device_handoff", screen } },
    };
    assert.deepEqual(actionResult(part), { label, href: `/${screen}` });
    assert.equal(actionResult({ ...part, state: "input-available" }), null);
    for (const output of [
      null,
      { ok: false, code: "forbidden" },
      { ok: true, value: { kind: "uploaded", screen } },
      ...["receipt-uploads", "expense-entry", "grocery-expense", "https://evil.invalid", "settings"]
        .filter((value) => value !== screen)
        .map((value) => ({ ok: true, value: { kind: "device_handoff", screen: value } })),
    ])
      assert.equal(actionResult({ ...part, output }), null);
  });
