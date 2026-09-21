import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { initialCorrectionDraft, parseCorrectionDraft } from "../src/money/correction-draft.ts";
import { correctionReview } from "../src/money/correction-review.ts";
import { context, id } from "./money-correction-draft-fixture.mjs";
const require = createRequire(new URL("../../../packages/domain/package.json", import.meta.url));
const fc = await import(require.resolve("fast-check"));
test("1000 correction drafts retain exact original values and member allocations at safe-centime boundaries", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
      fc.boolean(),
      (amount, partner) => {
        const current = context(amount),
          draft = initialCorrectionDraft(current),
          actor = id(partner ? 2 : 1);
        const parsed = parseCorrectionDraft(draft, current, actor);
        assert.equal(parsed.ok, true);
        const expense = parsed.correction.replacement.expense;
        assert.equal(expense.amountCentimes, String(amount));
        assert.deepEqual(
          expense.allocations,
          current.source.shares.map((s) => ({
            memberId: s.memberId,
            centimes: s.allocatedCentimes,
          })),
        );
        assert.equal(parsed.correction.sourceEventId, id(400));
        assert.equal(parsed.correction.expectedReversalId, null);
        const reversed = parseCorrectionDraft({ ...draft, mode: "reverse" }, current, actor);
        assert.equal(reversed.ok, true);
        assert.equal(reversed.correction.replacement, null);
        assert.equal(
          parseCorrectionDraft({ ...draft, amount: "90071992547409.92" }, current, actor).ok,
          false,
        );
      },
    ),
    { seed: 20260921, numRuns: 1000 },
  );
});
test("changed context, unsupported mode, wrong member and dropped grocery totals block review", () => {
  const current = context(1000),
    draft = initialCorrectionDraft(current);
  for (const patch of [
    { description: " " },
    { date: "2026-02-30" },
    { mode: "invalid" },
    { firstExact: "4.99" },
    { note: "\u0000" },
  ])
    assert.equal(parseCorrectionDraft({ ...draft, ...patch }, current, id(1)).ok, false);
  assert.equal(parseCorrectionDraft(draft, current, id(3)).ok, false);
  const blocked = { ...current, hasActiveRefunds: true, canReverse: false, canReplace: false };
  assert.equal(parseCorrectionDraft(draft, blocked, id(1)).ok, false);
  assert.equal(parseCorrectionDraft({ ...draft, mode: "reverse" }, blocked, id(1)).ok, false);
  const grocery = { ...current, source: { ...current.source, receiptTotalCentimes: "1500" } };
  assert.equal(parseCorrectionDraft(draft, grocery, id(1)).ok, false);
  const full = initialCorrectionDraft(grocery);
  assert.equal(
    parseCorrectionDraft(full, grocery, id(1)).correction.replacement.expense.receiptTotalCentimes,
    "1500",
  );
  const review = correctionReview(
    parseCorrectionDraft(full, grocery, id(1)).correction,
    grocery,
    id(1),
  );
  assert.match(review, /Receipt total: CHF 15.00/);
  assert.match(review, /Original balance effect/);
  assert.match(review, /CHF 5.00/);
});
test("opening repair preserves reviewed reversal identity and exact creditor without expense allocations", () => {
  const current = context(1000);
  current.source.event.kind = "opening_balance";
  current.source.shares = [
    { memberId: id(1), allocatedCentimes: null, deltaCentimes: "1000" },
    { memberId: id(2), allocatedCentimes: null, deltaCentimes: "-1000" },
  ];
  current.source.reversedById = id(401);
  current.canReverse = false;
  const draft = { ...initialCorrectionDraft(current), payerId: id(2), amount: "12.50" };
  const parsed = parseCorrectionDraft(draft, current, id(2));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.correction.expectedReversalId, id(401));
  assert.equal(parsed.correction.replacement.kind, "opening_balance");
  assert.equal(parsed.correction.replacement.opening.amountCentimes, "1250");
  assert.equal(parsed.correction.replacement.opening.payerId, id(2));
  assert.equal(parseCorrectionDraft({ ...draft, payerId: id(3) }, current, id(2)).ok, false);
  assert.equal(parseCorrectionDraft({ ...draft, mode: "reverse" }, current, id(2)).ok, false);
  assert.match(
    correctionReview(parsed.correction, current, id(2)),
    /existing reversal is retained/,
  );
});
