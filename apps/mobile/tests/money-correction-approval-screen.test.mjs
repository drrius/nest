import { context } from "./money-correction-draft-fixture.mjs";
import { replacement } from "../../../tests/database/native-correction-fixture.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  approvalActions,
  correctionConfirmation,
} from "../src/money/correction-approval-display.ts";
import { correctionApprovalOwner } from "../src/money/correction-approval-owner.ts";
import { fixture, pending, intent, id } from "./money-correction-approval-fixture.mjs";
test("confirmation copy preserves exact centimes and payer; stale, expired and uncertain views cannot create a new decision", () => {
  const approval = {
    ...pending,
    correction: { ...pending.correction, replacement: replacement("9007199254740991", "0") },
  };
  const current = context(1000);
  const text = correctionConfirmation(approval, current, id(1));
  assert.match(text, /CHF 90’071’992’547’409\.91/);
  assert.match(text, /Paid by You/);
  assert.match(text, /Original balance effect/);
  const view = {
    approval,
    context: current,
    online: true,
    attempt: null,
    active: true,
    busy: false,
    fresh: true,
    verify: false,
    notice: null,
  };
  assert.equal(approvalActions(view, 1).confirm, true);
  for (const patch of [
    { context: null },
    { context: { ...current, canReplace: false } },
    { context: { ...current, source: { ...current.source, reversedById: id(900) } } },
    { fresh: false },
    { online: false },
    { active: false },
    { busy: true },
    { verify: true },
    { attempt: intent },
  ])
    assert.equal(approvalActions({ ...view, ...patch }, 1).confirm, false);
  assert.equal(approvalActions(view, Date.parse(approval.expiresAt)).confirm, false);
  assert.equal(
    approvalActions({ ...view, attempt: intent }, Date.parse(approval.expiresAt)).retry,
    true,
  );
});
test("approval owner recreates a live runtime after unsubscribe and clears private content", async (t) => {
  const f = await fixture(t),
    owner = correctionApprovalOwner(f.operations, pending.id);
  assert.equal(owner.getSnapshot(), null);
  const stop = owner.subscribe(() => {}),
    first = owner.getSnapshot();
  await first.setOnline(true);
  await first.setActive(true);
  assert.notEqual(first.getSnapshot().approval, null);
  stop();
  assert.equal(first.getSnapshot().approval, null);
  assert.equal(owner.getSnapshot(), null);
  const again = owner.subscribe(() => {}),
    second = owner.getSnapshot();
  assert.notEqual(second, first);
  await second.setOnline(true);
  await second.setActive(true);
  assert.equal(second.getSnapshot().fresh, true);
  again();
});
