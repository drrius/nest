import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  initialSettlementDraft,
  parseSettlementDraft,
  settlementBalance,
} from "../src/money/settlement-draft.ts";
import { formatChfField } from "../../../packages/domain/src/money/centimes.ts";
const require = createRequire(new URL("../../../packages/domain/package.json", import.meta.url));
const fc = await import(require.resolve("fast-check"));
const pair = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"];
const balance = (amount, reverse = false) => ({
  version: 1,
  householdId: pair[0],
  eventCount: "1",
  openingEstablished: false,
  members: pair.map((actorId, index) => ({
    actorId,
    displayName: `Member ${index}`,
    centimes: String(index === (reverse ? 1 : 0) ? -BigInt(amount) : BigInt(amount)),
  })),
});
const draft = initialSettlementDraft("2026-09-21");
test("full and partial settlement drafts bind exact debt and direction across the safe centime range", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
      fc.boolean(),
      (amount, reverse) => {
        const current = balance(amount, reverse);
        const full = parseSettlementDraft(draft, current);
        assert.equal(full.ok, true);
        assert.equal(full.settlement.amountCentimes, String(amount));
        assert.equal(full.settlement.expectedOutstandingCentimes, String(amount));
        assert.equal(full.settlement.payerId, pair[reverse ? 1 : 0]);
        assert.equal(full.settlement.recipientId, pair[reverse ? 0 : 1]);
        const part = Math.max(1, Math.floor(amount / 2));
        const partial = parseSettlementDraft(
          { ...draft, mode: "partial", amount: formatChfField(part).replace(".", ",") },
          current,
        );
        assert.equal(partial.ok, true);
        assert.equal(partial.settlement.amountCentimes, String(part));
        assert.equal(partial.settlement.expectedOutstandingCentimes, String(amount));
        assert.equal(
          BigInt(amount) - BigInt(partial.settlement.amountCentimes),
          BigInt(amount - part),
        );
      },
    ),
    { seed: 20260921, numRuns: 1000 },
  );
});
test("draft rejects zero debt, invalid balances, excess amounts, malformed dates and unsupported text", () => {
  for (const amount of [
    "0",
    "-1",
    "1e2",
    "1’000",
    "1,000",
    "1.001",
    "NaN",
    "90071992547409.92",
    "10.01",
  ])
    assert.equal(
      parseSettlementDraft({ ...draft, mode: "partial", amount }, balance(1000)).ok,
      false,
    );
  for (const patch of [
    { description: " " },
    { description: "x".repeat(201) },
    { note: "x".repeat(4001) },
    { note: "\u0000" },
    { date: "2026-02-30" },
    { mode: "unexpected" },
  ])
    assert.equal(parseSettlementDraft({ ...draft, ...patch }, balance(1000)).ok, false);
  assert.equal(parseSettlementDraft(draft, balance(0)).ok, false);
  const bad = balance(1000);
  bad.members[1].centimes = "999";
  assert.equal(settlementBalance(bad), null);
  bad.members[1].centimes = "garbage";
  assert.equal(settlementBalance(bad), null);
});
test("draft preserves reviewed values when a new balance arrives and canonicalizes Unicode and IDs", () => {
  const current = balance(1000);
  current.members = current.members.map((member) => ({
    ...member,
    actorId: member.actorId.toUpperCase(),
  }));
  const old = parseSettlementDraft(
    { ...draft, description: "🪺".repeat(200), note: "🍽️".repeat(2000) },
    current,
  );
  assert.equal(old.ok, true);
  assert.equal(old.settlement.payerId, pair[0]);
  assert.equal(old.settlement.recipientId, pair[1]);
  assert.equal(parseSettlementDraft(draft, balance(700)).settlement.amountCentimes, "700");
  assert.equal(old.settlement.amountCentimes, "1000");
  assert.equal(parseSettlementDraft({ ...draft, note: "  " }, current).settlement.note, null);
});
