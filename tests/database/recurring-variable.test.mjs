import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture, read, as, id, json, approve } from "./recurring-variable-fixture.mjs";
import { VariableCycleReceipt } from "../../packages/contracts/src/recurring-variable.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
test("variable confirmation atomically consumes one cycle with exact centimes and unchanged mandate", async (t) => {
  const f = fixture(t);
  const rows = await Promise.all(Array.from({ length: 5 }, () => f.db.concurrent(as(1, f.post()))));
  const results = rows.map((row) => JSON.parse(row.stdout));
  for (const result of results) assert.deepEqual(result, results[0]);
  const receipt = results[0];
  assert.equal(Schema.is(VariableCycleReceipt)(receipt), true);
  assert.deepEqual(receipt.configuration, f.rule.configuration);
  assert.equal(receipt.source, "variable");
  assert.deepEqual(receipt.input, f.input);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "1");
  assert.equal(f.db.sql("select sum(receivable_delta_cents) from public.ledger_entries"), "0");
  assert.equal(
    f.db.sql(`select receivable_delta_cents from public.ledger_entries where member_id='${id(1)}'`),
    "50",
  );
  assert.equal(
    f.db.sql("select covered_through::text from private.nest_recurring_execution"),
    receipt.cycle.through,
  );
  assert.equal(
    f.db.sql("select revision::text from public.nest_recurring_rules"),
    f.receipt.revision,
  );
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "1");
  assert.throws(() => read(f.db, f.post(601)));
  assert.throws(() => read(f.db, f.post(602), 2));
  assert.throws(
    () =>
      f.db.sql(
        `select private.nest_post_fixed_cycle('${id(10)}','${f.rule.ruleId}','${f.receipt.revision}','${f.today}')`,
      ),
    /already confirmed explicitly/,
  );
  f.db.sql("update public.nest_recurring_rules set status='paused'");
  assert.deepEqual(read(f.db, f.post()), receipt);
  assert.equal(f.db.sql(as(2, "select count(*) from public.nest_recurring_cycles")), "1");
  assert.equal(f.db.sql(as(2, "select count(*) from public.nest_recurring_cycle_receipts")), "0");
  assert.equal(f.db.sql(as(3, "select count(*) from public.nest_recurring_cycles")), "0");
  assert.throws(
    () => f.db.sql(`delete from public.household_members where user_id='${id(1)}'`),
    /foreign key/,
  );
  assert.throws(() => read(f.db, f.post(), 3), /Not authorized/);
});
test("exact cycle approval, receipt failure and allocation validation cannot leave partial financial state", (t) => {
  const f = fixture(t),
    approval = approve(f.db, 600, f.input, "recurring.record-cycle");
  assert.throws(() => read(f.db, f.execute(null)), /approval required/);
  assert.throws(() =>
    read(
      f.db,
      f.execute(approval, {
        ...f.input,
        amountCentimes: "102",
        allocations: [
          { memberId: id(1), centimes: "52" },
          { memberId: id(2), centimes: "50" },
        ],
      }),
    ),
  );
  assert.equal(f.db.sql("select status from public.nest_action_approvals"), "approved");
  f.db.sql(
    "alter table public.nest_recurring_cycle_receipts add constraint fixture_receipt_failure check(false) not valid",
  );
  assert.throws(() => read(f.db, f.execute(approval)), /fixture_receipt_failure/);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "0");
  assert.equal(f.db.sql("select status from public.nest_action_approvals"), "approved");
  assert.equal(f.db.sql("select next_due_on::text from private.nest_recurring_execution"), f.today);
  f.db.sql(
    "alter table public.nest_recurring_cycle_receipts drop constraint fixture_receipt_failure",
  );
  const result = read(f.db, f.execute(approval));
  assert.equal(Schema.is(VariableCycleReceipt)(result), true);
  assert.equal(f.db.sql("select status from public.nest_action_approvals"), "consumed");
  assert.deepEqual(read(f.db, f.execute(approval)), result);
  assert.throws(() => read(f.db, f.post()));
  assert.throws(
    () => f.db.sql("delete from public.nest_recurring_cycles"),
    /append.only|immutable|cannot|not allowed/i,
  );
});
test("stale, foreign, future, malformed and stopped variable cycles cannot record", (t) => {
  const f = fixture(t);
  for (const patch of [
    { expectedRevision: id(999) },
    { ruleId: id(999) },
    { dueOn: "9999-12-31" },
    { dueOn: "2026-02-30" },
    { approved: true },
    { amountCentimes: "101.5" },
    { amountCentimes: "102" },
    {
      allocations: [
        { memberId: id(1), centimes: "51" },
        { memberId: id(3), centimes: "50" },
      ],
    },
  ])
    assert.throws(() => read(f.db, f.post(600, { ...f.input, ...patch })));
  assert.throws(() => read(f.db, f.post(), 3), /Not authorized/);
  for (const status of ["paused", "cancelled"]) {
    f.db.sql(`update public.nest_recurring_rules set status='${status}'`);
    assert.throws(() => read(f.db, f.post()), /Variable rule changed/);
  }
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "0");
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => read(f.db, f.post()), /Not authorized/);
});
test("pause racing explicit variable confirmation preserves at most the already-committed obligation", async (t) => {
  const f = fixture(t);
  const pause = `select public.nest_save_recurring_state('${id(10)}','${id(601)}',${json({ ruleId: f.input.ruleId, expectedRevision: f.input.expectedRevision, expectedStatus: "active", action: "pause" })})`;
  const result = await Promise.allSettled([
    f.db.concurrent(as(1, f.post())),
    f.db.concurrent(as(2, pause)),
  ]);
  assert.equal(result[1].status, "fulfilled");
  const posted = result[0].status === "fulfilled";
  assert.equal(f.db.sql("select count(*) from public.financial_events"), posted ? "1" : "0");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), posted ? "1" : "0");
  assert.equal(f.db.sql("select status from public.nest_recurring_rules"), "paused");
  if (posted) assert.deepEqual(read(f.db, f.post()), JSON.parse(result[0].value.stdout));
});
test("fixed mandates cannot be recorded through variable confirmation", (t) => {
  const f = fixture(t, {
    mode: "fixed",
    amountCentimes: "101",
    allocations: [
      { memberId: id(1), centimes: "51" },
      { memberId: id(2), centimes: "50" },
    ],
  });
  assert.throws(() => read(f.db, f.post()), /Variable rule changed/);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "0");
});
