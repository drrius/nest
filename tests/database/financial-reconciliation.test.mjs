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
db.file("tests/database/money-detail-seed.sql");
const snapshot = () => captureFinancialSnapshot(db.sql);
test("additive native balance read preserves exact retained rows and balances", () => {
  const before = snapshot();
  for (const file of [
    "20260921103207_native_money_balance_read.sql",
    "20260921104133_native_money_history_read.sql",
    "20260921105214_native_money_detail_read.sql",
  ])
    db.file(`supabase/migrations/${file}`);
  assert.equal(before.tables.financial_events.length, 6);
  assert.equal(before.tables.financial_allocations.length, 6);
  assert.equal(before.tables.ledger_entries.length, 12);
  assert.equal(before.balances[0].centimes, "9007199254740991");
  assert.deepEqual(reconcileFinancialSnapshots(before, snapshot()), { passed: true, failures: [] });
});
test("same balances and row counts cannot hide a changed receipt reference", () => {
  const before = snapshot();
  // Inject corruption only inside a rolled-back disposable fixture transaction.
  const after = captureFinancialSnapshot((query) =>
    db.sql(`begin;
    alter table public.financial_events disable trigger user;
    update public.financial_events set receipt_path='synthetic/replaced' where id='${id(100)}';
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

test("offsetting ledger corruption cannot hide behind unchanged member balances", () => {
  const before = snapshot();
  const after = captureFinancialSnapshot((query) =>
    db.sql(`begin;
    alter table public.ledger_entries disable trigger user;
    update public.ledger_entries set receivable_delta_cents=receivable_delta_cents +
      case when financial_event_id='${id(100)}' then 1 else -1 end *
      case when member_id='${id(1)}' then 1 else -1 end
      where financial_event_id in ('${id(100)}','${id(102)}');
    ${query}; rollback;`),
  );
  assert.deepEqual(after.balances, before.balances);
  assert.equal(after.invalidEvents, "0");
  assert.deepEqual(reconcileFinancialSnapshots(before, after).failures, [
    { table: "ledger_entries", missing: 0, changed: 4, added: 0 },
  ]);
});
test("allocation changes are detected independently of ledger balances", () => {
  const before = snapshot();
  const after = captureFinancialSnapshot((query) =>
    db.sql(`begin;
    alter table public.financial_allocations disable trigger user;
    update public.financial_allocations set allocated_cents=allocated_cents+1
      where financial_event_id='${id(100)}' and member_id='${id(1)}';
    ${query}; rollback;`),
  );
  assert.deepEqual(after.balances, before.balances);
  assert.deepEqual(reconcileFinancialSnapshots(before, after).failures, [
    { table: "financial_allocations", missing: 0, changed: 1, added: 0 },
  ]);
});

test("tenant-filtered reads cannot certify a complete migration", () => {
  assert.throws(
    () =>
      captureFinancialSnapshot((query) =>
        db.sql(`set role authenticated;
    set request.jwt.claim.sub='${id(3)}'; ${query}`),
      ),
    /complete RLS visibility|permission denied/,
  );
  const before = snapshot(),
    after = structuredClone(before);
  after.completeVisibility = false;
  assert.equal(reconcileFinancialSnapshots(before, after).passed, false);
});

test("unknown and missing snapshot versions fail closed", () => {
  const before = snapshot();
  for (const version of [1, 3, undefined]) {
    const after = { ...before, version };
    assert.equal(reconcileFinancialSnapshots(before, after).passed, false);
    assert.equal(reconcileFinancialSnapshots(after, before).passed, false);
  }
});

test("preexisting broken relationships block reconciliation even without row changes", () => {
  const broken = captureFinancialSnapshot((query) =>
    db.sql(`begin;
    set local session_replication_role=replica;
    update public.financial_allocations set member_id='${id(3)}'
      where financial_event_id='${id(100)}' and member_id='${id(1)}';
    ${query}; rollback;`),
  );
  assert.equal(broken.invalidRelationships, "1");
  assert.deepEqual(reconcileFinancialSnapshots(broken, broken).failures, [
    { invariant: "household-qualified-financial-references" },
  ]);
});
