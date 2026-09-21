import assert from "node:assert/strict";
import { test } from "node:test";
import { balanceTitle, formatChf, payerLabel } from "../src/money/format.ts";
test("Money display preserves centimes and signs through safe endpoints and 1000 split-sized amounts", () => {
  for (let n = 0; n < 1000; n++) {
    const value = n % 13 === 0 ? 9007199254740991n : BigInt(n * 103);
    for (const sign of [-1n, 1n]) {
      const formatted = formatChf(`${value * sign}`, true).replaceAll("’", "");
      const match = /^([+−]?)CHF (\d+)\.(\d{2})$/.exec(formatted);
      assert.ok(match);
      const restored = (BigInt(match[2]) * 100n + BigInt(match[3])) * (match[1] === "−" ? -1n : 1n);
      assert.equal(restored, value * sign);
    }
  }
  assert.equal(balanceTitle("0"), "You’re settled up");
  assert.equal(balanceTitle("-101"), "You owe CHF 1.01");
  assert.equal(balanceTitle("101"), "You’re owed CHF 1.01");
  assert.equal(payerLabel("opening_balance", true), "Opening balance credited to you");
  assert.equal(payerLabel("refund", false), "Refund received by your partner");
  assert.equal(payerLabel("settlement", true), "Payment recorded from you");
});
