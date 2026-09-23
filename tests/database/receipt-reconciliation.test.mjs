import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./expense-receipt-fixture.mjs";
import { payload, save } from "./native-expense-helpers.mjs";
import {
  captureReceiptSnapshot,
  reconcileReceiptSnapshots,
} from "../../tools/migration/receipt-snapshot.mjs";
function setup(t) {
  const f = fixture(t),
    path = f.path(100);
  f.seed(path);
  f.read(save(200, payload({ receiptPath: path })));
  return f;
}
test("retained claimed receipt metadata survives native reader migration without exposing paths", (t) => {
  const f = setup(t),
    before = captureReceiptSnapshot(f.db.sql);
  f.db.file("supabase/migrations/20260921170517_native_receipt_read.sql");
  assert.deepEqual(reconcileReceiptSnapshots(before, captureReceiptSnapshot(f.db.sql)), {
    passed: true,
    reason: null,
  });
  assert.equal(before.references.length, 1);
  assert.equal(JSON.stringify(before).includes("/receipts/"), false);
});
test("missing objects, wrong ownership, unclaimed uploads and public buckets block reconciliation", (t) => {
  const f = setup(t);
  for (const mutation of [
    "delete from storage.objects",
    `update storage.objects set metadata='{"size":128,"mimetype":"application/pdf"}'`,
    "update public.household_attachment_uploads set household_id='00000000-0000-4000-8000-000000000020'",
    "update public.household_attachment_uploads set state='pending'",
    "update storage.buckets set public=true",
  ]) {
    const broken = captureReceiptSnapshot((query) =>
      f.db.sql(`begin;
      set local session_replication_role=replica; ${mutation}; ${query}; rollback;`),
    );
    assert.deepEqual(reconcileReceiptSnapshots(broken, broken), {
      passed: false,
      reason: "invalid-receipt-reference",
    });
  }
});
test("object metadata changes fail preservation even while references remain valid", (t) => {
  const f = setup(t),
    before = captureReceiptSnapshot(f.db.sql);
  const changed = captureReceiptSnapshot((query) =>
    f.db.sql(`begin;
    update storage.objects set metadata='{"size":256,"mimetype":"image/jpeg"}';
    ${query}; rollback;`),
  );
  assert.equal(changed.references[0].valid, true);
  assert.deepEqual(reconcileReceiptSnapshots(before, changed), {
    passed: false,
    reason: "changed-receipt-reference",
  });
});
