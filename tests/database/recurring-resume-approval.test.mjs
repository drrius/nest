import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture, as, id, json, save, read } from "./recurring-mandate-fixture.mjs";
import { RecurringResumeApprovalEnvelope } from "../../packages/contracts/src/recurring-resume-approval.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = require("effect/Schema");
function setup(t) {
  const f = fixture(t);
  for (const name of [
    "20260921210444_native_recurring_state_command",
    "20260921211106_native_recurring_state_recovery",
    "20260921215304_native_recurring_resume_command",
    "20260921221542_native_recurring_resume_approval",
  ])
    f.db.file(`supabase/migrations/${name}.sql`);
  const input = f.input(100),
    saved = read(f.db, save(200, input));
  const paused = read(f.db, stop(201, saved.revision));
  const change = {
    ruleId: id(100),
    expectedRevision: paused.revision,
    expectedStatus: "paused",
    action: "resume",
    resumeFrom: f.start,
    firstDueOn: input.firstDueOn,
  };
  return { ...f, change };
}
const stop = (op, revision) =>
  `select public.nest_save_recurring_state('${id(10)}','${id(op)}',${json({ ruleId: id(100), expectedRevision: revision, expectedStatus: "active", action: "pause" })})`;
const query = (approval) =>
  `select public.nest_read_recurring_resume_approval('${id(10)}','${approval}')`;
const decide = (op, change, approval, yes = true) =>
  `select public.nest_decide_recurring_resume('${id(10)}','${id(op)}',${json(change)},'${approval}',${yes})`;
const propose = (db, op, change) =>
  db.sql(
    as(
      1,
      `select public.nest_propose_action('${id(10)}','${id(op)}','recurring.resume',1,${json(change)})`,
    ),
  );
test("private resumption approval atomically renews the mandate once and recovers after a subsequent pause", async (t) => {
  const { db, change } = setup(t),
    approval = propose(db, 202, change);
  assert.equal(Schema.is(RecurringResumeApprovalEnvelope)(read(db, query(approval))), true);
  const results = await Promise.all([
    db.concurrent(as(1, decide(202, change, approval))),
    db.concurrent(as(1, decide(202, change, approval))),
  ]);
  assert.deepEqual(results[0], results[1]);
  const resumed = read(db, query(approval));
  assert.equal(Schema.is(RecurringResumeApprovalEnvelope)(resumed), true);
  assert.equal(resumed.approval.status, "consumed");
  assert.equal(resumed.approval.receipt.status, "active");
  assert.deepEqual(resumed.approval.receipt.change, change);
  read(db, stop(203, resumed.approval.receipt.revision));
  assert.deepEqual(read(db, decide(202, change, approval)), resumed);
  assert.throws(() => read(db, query(approval), 2));
  assert.throws(() => read(db, query(approval), 3));
  assert.equal(db.sql("select count(*) from public.nest_recurring_revisions"), "4");
  assert.equal(db.sql("select count(*) from public.financial_events"), "0");
});
test("private resumption rejects altered dates, denial, expiry and revoked membership", (t) => {
  const { db, change } = setup(t),
    approval = propose(db, 202, change);
  assert.throws(() =>
    read(
      db,
      decide(202, { ...change, resumeFrom: "2099-01-01", firstDueOn: "2099-01-31" }, approval),
    ),
  );
  assert.throws(() => read(db, decide(202, change, approval), 2));
  assert.throws(() => read(db, decide(999, change, approval)));
  const denied = read(db, decide(202, change, approval, false));
  assert.equal(Schema.is(RecurringResumeApprovalEnvelope)(denied), true);
  assert.equal(denied.approval.status, "denied");
  assert.deepEqual(read(db, decide(202, change, approval, false)), denied);
  assert.throws(() => read(db, decide(202, change, approval)));
  const expired = propose(db, 203, change);
  db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${expired}'`,
  );
  assert.throws(() => read(db, decide(203, change, expired)));
  assert.equal(db.sql("select status from public.nest_recurring_rules"), "paused");
  assert.equal(db.sql("select count(*) from public.nest_recurring_revisions"), "2");
  db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => read(db, query(approval)));
  assert.throws(() => read(db, decide(202, change, approval, false)));
});
test("resumption receipt failure and stale revision roll back approval; superseded requests remain deniable", (t) => {
  const { db, input, change } = setup(t),
    approval = propose(db, 202, change);
  db.sql(`create function public.reject_resume_approval_receipt() returns trigger language plpgsql as $$ begin raise exception 'fixture persistence failure'; end $$;
    create trigger fail_receipt before insert on public.nest_recurring_state_receipts for each row execute function public.reject_resume_approval_receipt()`);
  assert.throws(() => read(db, decide(202, change, approval)));
  assert.equal(read(db, query(approval)).approval.status, "pending");
  assert.equal(db.sql("select status from public.nest_recurring_rules"), "paused");
  assert.equal(db.sql("select count(*) from public.nest_recurring_revisions"), "2");
  db.sql("drop trigger fail_receipt on public.nest_recurring_state_receipts");
  read(
    db,
    save(
      203,
      input(100, { description: "Partner edit" }, { expectedRevision: change.expectedRevision }),
    ),
    2,
  );
  assert.throws(() => read(db, decide(202, change, approval)));
  assert.equal(read(db, query(approval)).approval.status, "pending");
  assert.equal(read(db, decide(202, change, approval, false)).approval.status, "denied");
  assert.equal(db.sql("select status from public.nest_recurring_rules"), "paused");
  assert.equal(db.sql("select count(*) from public.nest_recurring_revisions"), "3");
  assert.equal(db.sql("select count(*) from public.financial_events"), "0");
});
