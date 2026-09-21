import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { initialExpenseDraft, parseExpenseDraft } from "../src/money/expense-draft.ts";
import { initialCorrectionDraft, parseCorrectionDraft } from "../src/money/correction-draft.ts";
import { expenseReview } from "../src/money/expense-review.ts";
import { receiptDraft, receiptReady, receiptStillMatches } from "../src/money/receipt-draft.ts";
import { ReceiptAttachmentRuntime } from "../src/money/receipt-attachment-runtime.ts";
import { context, id } from "./money-correction-draft-fixture.mjs";
const pair = [id(1), id(2)],
  path = `${id(10)}/receipts/${id(100)}.pdf`;
const base = {
  ...initialExpenseDraft(pair[0], "2026-09-21"),
  description: "Expense",
  amount: "1.01",
};
const view = { active: true, online: true, busy: null, status: "uploaded", path, verify: false };
test("expense review binds and discloses the exact uploaded receipt without changing allocations", () => {
  const without = parseExpenseDraft(base, pair).expense;
  const parsed = parseExpenseDraft({ ...base, ...receiptDraft(view) }, pair);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.expense.receiptPath, path);
  assert.deepEqual(parsed.expense.allocations, without.allocations);
  assert.match(
    expenseReview(
      parsed.expense,
      pair.map((actorId) => ({ actorId, displayName: actorId })),
    ),
    /Receipt attached/,
  );
  for (const receiptPath of [
    "https://foreign.example/receipt.pdf",
    "../receipt.pdf",
    `${id(10)}/receipts/${id(100)}.exe`,
  ])
    assert.equal(parseExpenseDraft({ ...base, receiptPath }, pair).ok, false);
});
test("pending selection, uncertain outcome, revoked ownership and hidden state cannot authorize Save", () => {
  for (const patch of [
    { status: "selected", path: null },
    { status: "uncertain", path: null },
    { busy: "selecting", status: "empty", path: null },
    { busy: "uploading" },
    { active: false },
    { online: false },
    { verify: true },
    { path: null },
  ]) {
    const state = { ...view, ...patch };
    assert.equal(receiptReady(state), false);
    if (receiptDraft(state).receiptPending)
      assert.equal(parseExpenseDraft({ ...base, ...receiptDraft(state) }, pair).ok, false);
  }
  assert.equal(receiptReady({ ...view, status: "empty", path: null }), true);
});
test("confirmation recheck rejects changed receipt, backgrounding and disposal", async () => {
  const file = { input: { contentType: "application/pdf" }, bytes: new Uint8Array(12) };
  const r = new ReceiptAttachmentRuntime({
    select: () => Effect.succeed(file),
    upload: () => Effect.succeed({ path }),
  });
  r.setActive(true);
  r.setOnline(true);
  assert.equal(receiptStillMatches(r, null), true);
  await r.select("pdf");
  assert.equal(receiptStillMatches(r, null), false);
  await r.upload();
  assert.equal(receiptStillMatches(r, path), true);
  assert.equal(receiptStillMatches(r, null), false);
  r.setActive(false);
  assert.equal(receiptDraft(r.getSnapshot()).receiptPending, true);
  assert.equal(receiptDraft(r.getSnapshot()).receiptPath, null);
  assert.equal(receiptStillMatches(r, path), false);
  r.setActive(true);
  r.dispose();
  assert.equal(receiptStillMatches(r, path), false);
});
test("corrections retain original attachment semantics and reject replacement paths", () => {
  const source = context(101),
    draft = initialCorrectionDraft(source);
  assert.equal(parseCorrectionDraft(draft, source, id(1)).ok, true);
  assert.equal(parseCorrectionDraft({ ...draft, receiptPath: path }, source, id(1)).ok, false);
});
