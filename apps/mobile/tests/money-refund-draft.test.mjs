import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { initialRefundDraft, parseRefundDraft } from "../src/money/refund-draft.ts";
import { formatChfField } from "../../../packages/domain/src/money/centimes.ts";
import { id } from "../../../tests/database/native-expense-helpers.mjs";
const require = createRequire(new URL("../../../packages/domain/package.json", import.meta.url));
const fc = await import(require.resolve("fast-check"));
const draft = initialRefundDraft("2026-09-21");
function context(amount) {
  const own = Math.floor(amount / 2),
    other = amount - own;
  return {
    version: 1,
    householdId: id(10),
    refundable: true,
    remaining: [
      { memberId: id(1), centimes: String(own) },
      { memberId: id(2), centimes: String(other) },
    ],
    source: {
      version: 1,
      householdId: id(10),
      note: null,
      category: null,
      reversedById: null,
      event: {
        eventId: id(400),
        kind: "expense",
        occurredOn: "2026-09-21",
        createdAt: "2026-09-21T00:00:00.000000Z",
        occurredOrder: "1",
        createdOrder: "1",
        description: "Original",
        amountCentimes: String(amount),
        createdBy: id(1),
        payerId: id(1),
        relatedEventId: null,
        hasReceipt: false,
      },
      shares: [
        { memberId: id(1), allocatedCentimes: String(own), deltaCentimes: String(other) },
        { memberId: id(2), allocatedCentimes: String(other), deltaCentimes: String(-other) },
      ],
    },
  };
}
test("full and partial refund drafts retain exact source and per-person caps across 1000 safe-centime vectors", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 2, max: Number.MAX_SAFE_INTEGER }),
      fc.boolean(),
      (amount, partner) => {
        const current = context(amount),
          actor = id(partner ? 2 : 1);
        const full = parseRefundDraft(draft, current, actor);
        assert.equal(full.ok, true);
        assert.equal(full.refund.amountCentimes, String(amount));
        assert.equal(full.refund.sourceEventId, id(400));
        assert.equal(full.refund.payerId, id(1));
        assert.deepEqual(full.refund.expectedRemaining, current.remaining);
        const part = Math.max(1, Math.floor(amount / 4));
        const partial = parseRefundDraft(
          { ...draft, mode: "partial", own: formatChfField(part).replace(".", ","), partner: "0" },
          current,
          actor,
        );
        assert.equal(partial.ok, true);
        assert.equal(partial.refund.amountCentimes, String(part));
        assert.equal(
          partial.refund.allocations.find((share) => share.memberId === actor).centimes,
          String(part),
        );
        assert.equal(
          partial.refund.allocations.find((share) => share.memberId !== actor).centimes,
          "0",
        );
      },
    ),
    { seed: 20260921, numRuns: 1000 },
  );
});
test("refund draft rejects excess per-person refunds, unsupported input and unavailable sources", () => {
  const current = context(1000);
  for (const value of ["", "-1", "1e2", "1.001", "5.01", "90071992547409.92"])
    assert.equal(
      parseRefundDraft({ ...draft, mode: "partial", own: value, partner: "0" }, current, id(1)).ok,
      false,
    );
  for (const patch of [
    { description: " " },
    { date: "2026-02-30" },
    { mode: "wrong" },
    { note: "\u0000" },
  ])
    assert.equal(parseRefundDraft({ ...draft, ...patch }, current, id(1)).ok, false);
  assert.equal(
    parseRefundDraft({ ...draft, mode: "partial", own: "0", partner: "0" }, current, id(1)).ok,
    false,
  );
  assert.equal(parseRefundDraft(draft, current, id(3)).ok, false);
  assert.equal(parseRefundDraft(draft, { ...current, refundable: false }, id(1)).ok, false);
  assert.equal(
    parseRefundDraft(
      draft,
      { ...current, source: { ...current.source, reversedById: id(401) } },
      id(1),
    ).ok,
    false,
  );
  const reviewed = parseRefundDraft(draft, current, id(1)).refund;
  const updated = {
    ...current,
    remaining: current.remaining.map((share) => ({ ...share, centimes: "200" })),
  };
  assert.equal(parseRefundDraft(draft, updated, id(1)).refund.amountCentimes, "400");
  assert.equal(reviewed.amountCentimes, "1000");
});
