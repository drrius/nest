import assert from "node:assert/strict";
import { as, id } from "../../tests/database/native-expense-helpers.mjs";

const write = (name, operation, payload) => `select public.${name}(
  '${id(11)}','${id(operation)}','${JSON.stringify(payload)}'::jsonb)`;

export function seedRecurringRecovery(db) {
  const today = db.sql(
    "select to_char((clock_timestamp() at time zone 'Europe/Zurich')::date,'YYYY-MM-DD')",
  );
  const configuration = {
    description: "Synthetic recovery variable bill",
    mode: "variable",
    amountCentimes: null,
    allocations: null,
    payerId: id(4),
    categoryId: null,
    note: null,
    startDate: today,
    schedule: { kind: "monthly", dayOfMonth: Number(today.slice(8)) },
  };
  const created = record(db, "recurring", 1880, {
    ruleId: id(1881),
    expectedRevision: null,
    configuration,
    firstDueOn: today,
  });
  const cycle = record(db, "recurring_cycle", 1882, {
    ruleId: id(1881),
    expectedRevision: created.receipt.revision,
    dueOn: today,
    amountCentimes: "101",
    allocations: [
      { memberId: id(4), centimes: "51" },
      { memberId: id(5), centimes: "50" },
    ],
  });
  const state = record(db, "recurring_state", 1883, {
    ruleId: id(1881),
    expectedRevision: created.receipt.revision,
    expectedStatus: "active",
    action: "pause",
  });
  return { receipts: [created, cycle, state], history: recurringSnapshot(db) };
}

function record(db, kind, operation, payload) {
  const name = kind === "recurring_cycle" ? "nest_save_variable_cycle" : `nest_save_${kind}`;
  return {
    kind,
    operation,
    receipt: JSON.parse(db.sql(as(4, write(name, operation, payload)))),
    refusedWrite: write(name, operation + 20, payload),
  };
}

export function verifyRecurringRecovery(db, expected) {
  for (const { kind, operation, receipt, refusedWrite } of expected.receipts) {
    const read = `select public.nest_read_${kind}_save('${id(11)}','${id(operation)}')`;
    const recovered = JSON.parse(db.sql(as(4, read)));
    assert.equal(recovered.status, "recorded");
    assert.deepEqual(recovered.receipt, receipt);
    const partner = JSON.parse(db.sql(as(5, read)));
    assert.equal(partner.status, "unresolved");
    assert.equal(partner.receipt, null);
    assert.throws(() => db.sql(as(3, read)), /Not authorized/);
    assert.throws(() => db.sql(as(4, refusedWrite)), /permission denied/);
    assert.throws(
      () =>
        db.sql(
          as(4, `select public.nest_cancel_${kind}_save('${id(11)}','${id(operation + 30)}')`),
        ),
      /permission denied/,
    );
  }
  assert.equal(recurringSnapshot(db), expected.history);
  return {
    recoveredKinds: expected.receipts.map(({ kind }) => kind),
    historyPreserved: true,
    newWritesRefused: true,
  };
}

function recurringSnapshot(db) {
  return db.sql(`select jsonb_build_object(
    'rules',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.nest_recurring_rules r),
    'revisions',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.nest_recurring_revisions r),
    'cycles',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.nest_recurring_cycles r))`);
}
