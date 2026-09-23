import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import {
  captureFinancialSnapshot,
  reconcileFinancialSnapshots,
} from "../../tools/migration/financial-snapshot.mjs";
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/money-ledger-fixture.sql");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
db.sql(`insert into public.financial_events(id,household_id,type,occurred_on,created_by_member_id,payer_member_id,description,amount_cents,receipt_path)
 values('${id(100)}','${id(10)}','opening_balance','2026-09-23','${id(1)}','${id(1)}','Synthetic',100,'synthetic/receipt');
 insert into public.ledger_entries(household_id,financial_event_id,member_id,receivable_delta_cents)
 values('${id(10)}','${id(100)}','${id(1)}',100),('${id(10)}','${id(100)}','${id(2)}',-100);`);
const snapshot = () => captureFinancialSnapshot(db.sql);
test("additive native balance read preserves exact retained rows and balances", () => {
  const before = snapshot();
  db.file("supabase/migrations/20260921103207_native_money_balance_read.sql");
  assert.deepEqual(reconcileFinancialSnapshots(before, snapshot()), { passed: true, failures: [] });
});
test("same balances and row counts cannot hide a changed receipt reference", () => {
  const before = snapshot();
  // Inject corruption only inside a rolled-back disposable fixture transaction.
  const after = captureFinancialSnapshot((query) =>
    db.sql(`begin;
    alter table public.financial_events disable trigger user;
    update public.financial_events set receipt_path='synthetic/replaced';
    ${query}; rollback;`),
  );
  const result = reconcileFinancialSnapshots(before, after);
  assert.equal(result.passed, false);
  assert.deepEqual(result.failures, [
    { table: "financial_events", missing: 0, changed: 1, added: 0 },
  ]);
});
test("missing identities, new history, balance drift and incomplete events all block reconciliation", () => {
  const before = snapshot(),
    after = structuredClone(before);
  after.tables.ledger_entries[0].id = id(999);
  after.balances[0].centimes = "101";
  after.invalidEvents = "1";
  const result = reconcileFinancialSnapshots(before, after);
  assert.equal(result.passed, false);
  assert.equal(result.failures.length, 3);
  assert.deepEqual(result.failures[0], {
    table: "ledger_entries",
    missing: 1,
    changed: 0,
    added: 1,
  });
});
