import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture, as, id, json, save, read } from "./recurring-mandate-fixture.mjs";
import { RecurringApprovalEnvelope } from "../../packages/contracts/src/recurring-approval.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = require("effect/Schema");
function setup(t) {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260921201455_native_recurring_approval.sql");
  return f;
}
function propose(db, operation, input) {
  const command = input.expectedRevision === null ? "recurring.create" : "recurring.update";
  return db.sql(
    as(
      1,
      `select public.nest_propose_action('${id(10)}','${id(operation)}','${command}',1,${json(input)})`,
    ),
  );
}
const query = (approval) => `select public.nest_read_recurring_approval('${id(10)}','${approval}')`;
const decide = (operation, input, approval, yes = true) =>
  `select public.nest_decide_recurring('${id(10)}','${id(operation)}',${json(input)},'${approval}',${yes})`;
test("recurring approval consumes exact create once, retains historical receipt after edits and scopes reads", async (t) => {
  const { db, input } = setup(t),
    value = input(100),
    approval = propose(db, 200, value);
  const pending = read(db, query(approval));
  assert.equal(Schema.is(RecurringApprovalEnvelope)(pending), true);
  assert.equal(pending.approval.status, "pending");
  const concurrent = await Promise.all([
    db.concurrent(as(1, decide(200, value, approval))),
    db.concurrent(as(1, decide(200, value, approval))),
  ]);
  assert.deepEqual(concurrent[0], concurrent[1]);
  const consumed = read(db, query(approval));
  assert.equal(Schema.is(RecurringApprovalEnvelope)(consumed), true);
  assert.equal(consumed.approval.status, "consumed");
  const changed = input(
    100,
    { description: "Later edit" },
    { expectedRevision: consumed.approval.receipt.revision },
  );
  read(db, save(201, changed));
  assert.deepEqual(read(db, decide(200, value, approval)), consumed);
  assert.throws(() => db.sql(as(2, query(approval))));
  assert.throws(() => db.sql(as(3, query(approval))));
  assert.equal(db.sql("select count(*) from public.nest_recurring_revisions"), "2");
  assert.equal(db.sql("select count(*) from public.financial_events"), "0");
});
test("denial is durable; changed payload, expired and foreign approval cannot grant a mandate", (t) => {
  const { db, input } = setup(t),
    value = input(100),
    approval = propose(db, 200, value);
  assert.throws(() => db.sql(as(1, decide(200, { ...value, firstDueOn: "2030-01-01" }, approval))));
  assert.throws(() => db.sql(as(2, decide(200, value, approval))));
  const denied = read(db, decide(200, value, approval, false));
  assert.equal(Schema.is(RecurringApprovalEnvelope)(denied), true);
  assert.equal(denied.approval.status, "denied");
  assert.deepEqual(read(db, decide(200, value, approval, false)), denied);
  assert.throws(() => db.sql(as(1, decide(200, value, approval))));
  const expired = propose(db, 201, input(101));
  db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${expired}'`,
  );
  assert.throws(() => db.sql(as(1, decide(201, input(101), expired))));
  assert.equal(db.sql("select count(*) from public.nest_recurring_rules"), "0");
});
test("failed or stale recurring execution rolls back native approval and creates no partial revision", (t) => {
  const { db, input } = setup(t),
    value = input(100),
    approval = propose(db, 200, value);
  const saved = read(db, save(201, value));
  assert.throws(() => db.sql(as(1, decide(200, value, approval))));
  assert.equal(read(db, query(approval)).approval.status, "pending");
  const edit = input(100, { description: "Reviewed edit" }, { expectedRevision: saved.revision });
  const editing = propose(db, 202, edit);
  const result = read(db, decide(202, edit, editing));
  assert.equal(result.approval.status, "consumed");
  assert.equal(result.approval.receipt.rule.expectedRevision, saved.revision);
  db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => db.sql(as(1, query(editing))));
  assert.throws(() => db.sql(as(1, decide(202, edit, editing))));
});
