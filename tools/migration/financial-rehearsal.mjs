import { readFileSync } from "node:fs";
import { captureFinancialSnapshot, reconcileFinancialSnapshots } from "./financial-snapshot.mjs";
import { captureReceiptSnapshot, reconcileReceiptSnapshots } from "./receipt-snapshot.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function seedFinancialRehearsal(db) {
  db.sql(`insert into auth.users(id) values('${id(1)}'),('${id(2)}');
    insert into public.households(id,name) values('${id(10)}','Synthetic migration household');
    insert into public.household_members(household_id,user_id,display_name)
      values('${id(10)}','${id(1)}','First'),('${id(10)}','${id(2)}','Second');
    set request.jwt.claim.sub='${id(1)}';
    select public.reserve_household_attachment('${id(10)}/receipts/${id(700)}.jpg','image/jpeg');
    insert into storage.objects(bucket_id,name,metadata)
      values('household-files','${id(10)}/receipts/${id(700)}.jpg','{"mimetype":"image/jpeg","size":128}');`);
  // Audited synthetic six-kind financial fixture; use a valid retained receipt and civil date.
  const seed = readFileSync(
    new URL("../../tests/database/money-detail-seed.sql", import.meta.url),
    "utf8",
  )
    .replace("'infinity'", "'2026-09-21'")
    .replace("'private/receipt.jpg'", `'${id(10)}/receipts/${id(700)}.jpg'`);
  db.sql(`set request.jwt.claim.sub='${id(1)}'; ${seed}`);
}
export function captureRehearsal(db) {
  return { financial: captureFinancialSnapshot(db.sql), receipts: captureReceiptSnapshot(db.sql) };
}
export function compareRehearsal(before, after) {
  const financial = reconcileFinancialSnapshots(before.financial, after.financial);
  const receipts = reconcileReceiptSnapshots(before.receipts, after.receipts);
  return {
    passed: financial.passed && receipts.passed,
    financial,
    receipts,
    retainedEvents: before.financial.tables.financial_events.length,
    retainedAllocations: before.financial.tables.financial_allocations.length,
    retainedLedgerEntries: before.financial.tables.ledger_entries.length,
    retainedReceiptReferences: before.receipts.references.length,
  };
}
