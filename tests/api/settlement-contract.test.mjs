import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  SettlementInput,
  SettlementReceipt,
  ExecuteSettlement,
} from "../../packages/contracts/src/settlement.ts";
import { id } from "../database/native-expense-helpers.mjs";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url)),
  Schema = await import(require.resolve("effect/Schema"));
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(value);
const input = {
  description: "Settlement",
  amountCentimes: "1000",
  expectedOutstandingCentimes: "1000",
  payerId: id(2),
  recipientId: id(1),
  mode: "full",
  date: "2026-09-21",
  note: null,
};
test("settlement contract binds exact positive centimes and full/partial intent through the safe endpoint", () => {
  for (let n = 0; n < 1000; n++) {
    const outstanding = n === 0 ? Number.MAX_SAFE_INTEGER : n * 7919 + 1;
    for (const mode of ["full", "partial"]) {
      const value = {
        ...input,
        mode,
        expectedOutstandingCentimes: String(outstanding),
        amountCentimes: String(
          mode === "full" ? outstanding : Math.max(1, Math.floor(outstanding / 3)),
        ),
      };
      assert.deepEqual(decode(SettlementInput, value), value);
    }
  }
  for (const patch of [
    { amountCentimes: "0" },
    { amountCentimes: "1001" },
    { amountCentimes: "999" },
    { amountCentimes: 1000 },
    { expectedOutstandingCentimes: "9007199254740992" },
    { recipientId: id(2) },
    { date: "2026-02-30" },
    { description: "\u00a0" },
    { note: "\u0000" },
    { approvalId: id(100) },
  ])
    assert.throws(() => decode(SettlementInput, { ...input, ...patch }));
});
test("settlement receipts cannot name an actor outside the exact payer/recipient pair or bypass approval fields", () => {
  const receipt = {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    operationId: id(100),
    eventId: id(101),
    approvalId: null,
    settlement: input,
  };
  assert.deepEqual(decode(SettlementReceipt, receipt), receipt);
  assert.throws(() => decode(SettlementReceipt, { ...receipt, actorId: id(3) }));
  assert.throws(() =>
    decode(ExecuteSettlement, { operationId: id(100), settlement: input, approvalId: null }),
  );
});
