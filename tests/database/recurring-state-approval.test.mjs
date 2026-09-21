import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture, as, id, json, save, read } from "./recurring-mandate-fixture.mjs";
import { RecurringStateApprovalEnvelope } from "../../packages/contracts/src/recurring-state-approval.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = require("effect/Schema");
function setup(t) {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260921210444_native_recurring_state_command.sql");
  f.db.file("supabase/migrations/20260921213056_native_recurring_state_approval.sql");
  const saved = read(f.db, save(200, f.input(100)));
  const change = {
    ruleId: id(100),
    expectedRevision: saved.revision,
    expectedStatus: "active",
    action: "pause",
  };
  return { ...f, change };
}
const query = (approval) =>
  `select public.nest_read_recurring_state_approval('${id(10)}','${approval}')`;
const decide = (operation, change, approval, yes = true) =>
  `select public.nest_decide_recurring_state('${id(10)}','${id(operation)}',${json(change)},'${approval}',${yes})`;
const propose = (db, operation, change) =>
  db.sql(
    as(
      1,
      `select public.nest_propose_action('${id(10)}','${id(operation)}','recurring.${change.action}',1,${json(change)})`,
    ),
  );
test("private state approval atomically pauses once and preserves its historical receipt after cancellation", async (t) => {
  const { db, change } = setup(t),
    approval = propose(db, 201, change);
  assert.equal(Schema.is(RecurringStateApprovalEnvelope)(read(db, query(approval))), true);
  const results = await Promise.all([
    db.concurrent(as(1, decide(201, change, approval))),
    db.concurrent(as(1, decide(201, change, approval))),
  ]);
  assert.deepEqual(results[0], results[1]);
  const paused = read(db, query(approval));
  assert.equal(Schema.is(RecurringStateApprovalEnvelope)(paused), true);
  assert.equal(paused.approval.status, "consumed");
  assert.equal(paused.approval.receipt.status, "paused");
  const cancellation = {
    ...change,
    expectedRevision: paused.approval.receipt.revision,
    expectedStatus: "paused",
    action: "cancel",
  };
  const cancelApproval = propose(db, 202, cancellation);
  assert.equal(
    read(db, decide(202, cancellation, cancelApproval)).approval.receipt.status,
    "cancelled",
  );
  assert.deepEqual(read(db, decide(201, change, approval)), paused);
  assert.throws(() => read(db, query(approval), 2));
  assert.throws(() => read(db, query(approval), 3));
  assert.equal(db.sql("select count(*) from public.nest_recurring_state_receipts"), "2");
  assert.equal(db.sql("select count(*) from public.nest_recurring_revisions"), "3");
  assert.equal(db.sql("select count(*) from public.financial_events"), "0");
});
test("state denial and expiration cannot stop a rule; exact payload and current ownership are required", (t) => {
  const { db, change } = setup(t),
    approval = propose(db, 201, change);
  assert.throws(() => read(db, decide(201, { ...change, action: "cancel" }, approval)));
  assert.throws(() => read(db, decide(201, change, approval), 2));
  const denied = read(db, decide(201, change, approval, false));
  assert.equal(Schema.is(RecurringStateApprovalEnvelope)(denied), true);
  assert.equal(denied.approval.status, "denied");
  assert.deepEqual(read(db, decide(201, change, approval, false)), denied);
  assert.throws(() => read(db, decide(201, change, approval)));
  const expired = propose(db, 202, change);
  db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${expired}'`,
  );
  assert.throws(() => read(db, decide(202, change, expired)));
  assert.equal(db.sql("select status from public.nest_recurring_rules"), "active");
  assert.equal(db.sql("select count(*) from public.nest_recurring_state_receipts"), "0");
  db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => read(db, query(approval)));
  assert.throws(() => read(db, decide(201, change, approval, false)));
});
test("state receipt failure rolls back approval and stop; obsolete proposals remain explicitly deniable", (t) => {
  const { db, input, change } = setup(t),
    approval = propose(db, 201, change);
  db.sql(`create function public.reject_state_receipt() returns trigger language plpgsql as $$ begin raise exception 'fixture persistence failure'; end $$;
    create trigger fail_receipt before insert on public.nest_recurring_state_receipts for each row execute function public.reject_state_receipt()`);
  assert.throws(() => read(db, decide(201, change, approval)));
  assert.equal(read(db, query(approval)).approval.status, "pending");
  assert.equal(db.sql("select status from public.nest_recurring_rules"), "active");
  assert.equal(db.sql("select count(*) from public.nest_recurring_revisions"), "1");
  db.sql("drop trigger fail_receipt on public.nest_recurring_state_receipts");
  read(
    db,
    save(
      202,
      input(
        100,
        { description: "Partner revision" },
        { expectedRevision: change.expectedRevision },
      ),
    ),
    2,
  );
  assert.throws(() => read(db, decide(201, change, approval)));
  assert.equal(read(db, query(approval)).approval.status, "pending");
  assert.equal(read(db, decide(201, change, approval, false)).approval.status, "denied");
  assert.equal(db.sql("select status from public.nest_recurring_rules"), "active");
  assert.equal(db.sql("select count(*) from public.nest_recurring_state_receipts"), "0");
  assert.equal(db.sql("select count(*) from public.financial_events"), "0");
});
