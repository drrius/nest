import assert from "node:assert/strict";
import { as, id, payload, propose } from "../../tests/database/native-expense-helpers.mjs";

const decision = (operation, approval) => `select public.nest_decide_expense(
  '${id(10)}','${id(operation)}','${JSON.stringify(payload())}'::jsonb,'${approval}',true)`;
const read = (approval) => `select public.nest_read_expense_approval('${id(10)}','${approval}')`;

export function seedApprovalRecovery(db) {
  const confirmed = propose(db, 1900);
  const consumed = JSON.parse(db.sql(as(1, decision(1900, confirmed))));
  assert.equal(consumed.approval.status, "consumed");
  assert.ok(consumed.approval.receipt);
  const pending = propose(db, 1901);
  const waiting = JSON.parse(db.sql(as(1, read(pending))));
  assert.equal(waiting.approval.status, "pending");
  assert.equal(waiting.approval.receipt, null);
  return { confirmed, consumed, pending, waiting, history: snapshot(db) };
}

export function verifyApprovalRecovery(db, expected) {
  assert.deepEqual(JSON.parse(db.sql(as(1, read(expected.confirmed)))), expected.consumed);
  assert.deepEqual(JSON.parse(db.sql(as(1, read(expected.pending)))), expected.waiting);
  for (const actor of [2, 3]) {
    assert.throws(() => db.sql(as(actor, read(expected.confirmed))), /Not authorized/);
    assert.throws(() => db.sql(as(actor, read(expected.pending))), /Not authorized/);
  }
  assert.throws(() => db.sql(as(1, decision(1901, expected.pending))), /permission denied/);
  assert.throws(
    () =>
      db.sql(
        as(
          1,
          `select public.nest_execute_expense(
    '${id(10)}','${id(1901)}','${JSON.stringify(payload())}'::jsonb,'${expected.pending}')`,
        ),
      ),
    /permission denied/,
  );
  assert.equal(snapshot(db), expected.history);
  return { confirmedReceiptPreserved: true, pendingNotExecuted: true, privateReadsEnforced: true };
}

function snapshot(db) {
  return db.sql(`select jsonb_agg(to_jsonb(a) order by id)
    from public.nest_action_approvals a where invocation_id in ('${id(1900)}','${id(1901)}')`);
}
