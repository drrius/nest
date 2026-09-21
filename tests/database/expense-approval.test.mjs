import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { as, id, payload, propose, count } from "./native-expense-helpers.mjs";
const db = startFixturePostgres();
after(() => db.stop());
for (const file of [
  "tests/database/money-expense-fixture.sql",
  "supabase/migrations/20260919213407_native_action_approvals.sql",
  "supabase/migrations/20260921114330_native_expense_command.sql",
  "supabase/migrations/20260921120149_native_expense_approval.sql",
])
  db.file(file);
const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const decideSql = (operation, approval, approved = true, expense = payload()) =>
  `select public.nest_decide_expense('${id(10)}','${id(operation)}',${json(expense)},'${approval}',${approved})`;
const read = (approval, actor = 1) =>
  JSON.parse(
    db.sql(as(actor, `select public.nest_read_expense_approval('${id(10)}','${approval}')`)),
  );
const decide = (operation, approval, approved = true) =>
  JSON.parse(db.sql(as(1, decideSql(operation, approval, approved))));

test("one atomic confirmation posts and recovers authoritative receipt after expiry; competing confirmations converge", async () => {
  const approval = propose(db, 100);
  const pending = read(approval);
  assert.equal(pending.approval.status, "pending");
  assert.equal(pending.approval.receipt, null);
  assert.deepEqual(pending.approval.expense, payload());
  const before = Number(count(db));
  const responses = await Promise.all(
    Array.from({ length: 6 }, () => db.concurrent(as(1, decideSql(100, approval)))),
  );
  const values = responses.map(({ stdout }) => JSON.parse(stdout.trim()));
  for (const value of values) assert.deepEqual(value, values[0]);
  const result = values[0];
  assert.equal(result.approval.status, "consumed");
  assert.equal(result.approval.receipt.approvalId, approval);
  assert.equal(Number(count(db)), before + 1);
  db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 day' where id='${approval}'`,
  );
  const retried = decide(100, approval);
  assert.deepEqual(retried.approval.receipt, result.approval.receipt);
  assert.deepEqual(read(approval), retried);
  assert.throws(() => decide(100, approval, false), /no longer pending|expired/);
  assert.equal(Number(count(db)), before + 1);
});

test("denial is durable without writes and cannot be changed to confirmation", () => {
  const approval = propose(db, 200),
    before = count(db);
  const denied = decide(200, approval, false);
  assert.equal(denied.approval.status, "denied");
  assert.equal(denied.approval.receipt, null);
  db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 day' where id='${approval}'`,
  );
  assert.equal(decide(200, approval, false).approval.status, "denied");
  assert.throws(() => decide(200, approval), /expired/);
  assert.equal(count(db), before);
});

test("approval read and decision isolate owners and reject modified payload and operation", () => {
  const approval = propose(db, 300),
    before = count(db);
  for (const actor of [2, 3]) {
    assert.throws(() => read(approval, actor), /Not authorized/);
    assert.throws(() => db.sql(as(actor, decideSql(300, approval))), /Not authorized/);
  }
  assert.throws(() => read(id(999)), /Not authorized/);
  assert.throws(() => decide(301, approval), /changed/);
  assert.throws(
    () => db.sql(as(1, decideSql(300, approval, true, payload({ note: "Changed" })))),
    /changed/,
  );
  assert.equal(read(approval).approval.status, "pending");
  assert.equal(count(db), before);
});

test("expense failure rolls back both confirmation and consumption so pending approval can recover", () => {
  const approval = propose(db, 400),
    before = count(db);
  db.sql(
    "alter table public.nest_expense_receipts add constraint fixture_fail check(false) not valid",
  );
  try {
    assert.throws(() => decide(400, approval), /fixture_fail/);
    assert.equal(read(approval).approval.status, "pending");
    assert.equal(count(db), before);
  } finally {
    db.sql("alter table public.nest_expense_receipts drop constraint fixture_fail");
  }
  assert.equal(decide(400, approval).approval.status, "consumed");
});

test("concurrent confirm and deny finish in exactly one durable outcome", async () => {
  const approval = propose(db, 500),
    before = Number(count(db));
  const results = await Promise.allSettled([
    db.concurrent(as(1, decideSql(500, approval))),
    db.concurrent(as(1, decideSql(500, approval, false))),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const final = read(approval);
  assert.ok(["consumed", "denied"].includes(final.approval.status));
  assert.equal(Number(count(db)), before + (final.approval.status === "consumed" ? 1 : 0));
});
