import assert from "node:assert/strict";
import { as, id } from "../../tests/database/native-expense-helpers.mjs";

const read = (approval) => `select public.nest_read_settlement_approval('${id(11)}','${approval}')`;
const decision = (entry, approved) => `select public.nest_decide_settlement(
  '${id(11)}','${id(entry.operation)}','${JSON.stringify(entry.payload)}'::jsonb,
  '${entry.approval}',${approved})`;

function propose(db, operation) {
  const balance = BigInt(
    db.sql(`select coalesce(sum(receivable_delta_cents),0)
    from public.ledger_entries where household_id='${id(11)}' and member_id='${id(4)}'`),
  );
  assert.notEqual(balance, 0n);
  const payload = {
    description: "Synthetic approval recovery",
    amountCentimes: "1",
    expectedOutstandingCentimes: (balance < 0n ? -balance : balance).toString(),
    payerId: id(balance > 0n ? 5 : 4),
    recipientId: id(balance > 0n ? 4 : 5),
    mode: "partial",
    date: "2026-09-25",
    note: null,
  };
  const approval = db.sql(
    as(
      4,
      `select public.nest_propose_action(
    '${id(11)}','${id(operation)}','settlements.record',1,'${JSON.stringify(payload)}'::jsonb)`,
    ),
  );
  return { operation, payload, approval };
}

export function seedSettlementApprovalRecovery(db) {
  const entries = [];
  for (const [operation, status] of [
    [1910, "consumed"],
    [1911, "denied"],
    [1912, "pending"],
  ]) {
    const entry = propose(db, operation);
    if (status !== "pending") db.sql(as(4, decision(entry, status === "consumed")));
    const result = JSON.parse(db.sql(as(4, read(entry.approval))));
    assert.equal(result.approval.status, status);
    assert.equal(result.approval.receipt !== null, status === "consumed");
    entries.push({ ...entry, result });
  }
  return { entries, history: snapshot(db) };
}

export function verifySettlementApprovalRecovery(db, expected) {
  for (const entry of expected.entries) {
    assert.deepEqual(JSON.parse(db.sql(as(4, read(entry.approval)))), entry.result);
    for (const actor of [5, 3])
      assert.throws(() => db.sql(as(actor, read(entry.approval))), /Not authorized/);
    for (const approved of [true, false])
      assert.throws(() => db.sql(as(4, decision(entry, approved))), /permission denied/);
  }
  assert.equal(snapshot(db), expected.history);
  return {
    consumedReceiptPreserved: true,
    deniedPreserved: true,
    pendingNotExecuted: true,
    privateReadsEnforced: true,
    decisionsRefused: true,
  };
}

function snapshot(db) {
  return db.sql(`select jsonb_agg(to_jsonb(a) order by id) from public.nest_action_approvals a
    where invocation_id in ('${id(1910)}','${id(1911)}','${id(1912)}')`);
}
