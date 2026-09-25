import { json, recurringApprovalInput } from "./recurring-approval-inputs.mjs";
import assert from "node:assert/strict";
import { as, id } from "../../tests/database/native-expense-helpers.mjs";

const read = (entry) =>
  `select public.nest_read_${entry.kind}_approval('${id(11)}','${entry.approval}')`;
const decide = (entry, approved) => `select public.nest_decide_${entry.kind}(
  '${id(11)}','${id(entry.operation)}',${json(entry.input)},'${entry.approval}',${approved})`;
const kinds = {
  create: "recurring",
  update: "recurring",
  pause: "recurring_state",
  cancel: "recurring_state",
  resume: "recurring_resume",
  "record-cycle": "variable_cycle",
  "link-cycle": "manual_cycle",
};

export function seedRecurringApprovalRecovery(db) {
  const today = db.sql(
    "select to_char((clock_timestamp() at time zone 'Europe/Zurich')::date,'YYYY-MM-DD')",
  );
  const entries = Object.keys(kinds).flatMap((action, kindIndex) =>
    ["consumed", "denied", "pending"].map((status, index) =>
      seedEntry(db, { action, status, base: 2000 + kindIndex * 100 + index * 10, today }),
    ),
  );
  return { entries, history: approvalSnapshot(db, entries) };
}

function seedEntry(db, specification) {
  const { action, status, base } = specification;
  const input = recurringApprovalInput(db, specification);
  const command = `recurring.${action}`;
  const entry = { kind: kinds[action], command, input, operation: base + 2 };
  entry.approval = db.sql(
    as(
      4,
      `select public.nest_propose_action('${id(11)}',
    '${id(entry.operation)}','${command}',1,${json(input)})`,
    ),
  );
  if (status !== "pending") db.sql(as(4, decide(entry, status === "consumed")));
  entry.result = JSON.parse(db.sql(as(4, read(entry))));
  assert.equal(entry.result.approval.status, status);
  assert.equal(entry.result.approval.receipt !== null, status === "consumed");
  return entry;
}

export function verifyRecurringApprovalRecovery(db, expected) {
  for (const entry of expected.entries) {
    assert.deepEqual(JSON.parse(db.sql(as(4, read(entry)))), entry.result);
    for (const actor of [5, 3])
      assert.throws(() => db.sql(as(actor, read(entry))), /Not authorized/);
    assert.throws(() => db.sql(`set role anon; ${read(entry)}`), /permission denied/);
    for (const approved of [true, false])
      assert.throws(() => db.sql(as(4, decide(entry, approved))), /permission denied/);
    assert.throws(
      () =>
        db.sql(
          as(
            4,
            `select public.nest_execute_${entry.kind}(
      '${id(11)}','${id(entry.operation)}',${json(entry.input)},'${entry.approval}')`,
          ),
        ),
      /permission denied/,
    );
  }
  assert.equal(approvalSnapshot(db, expected.entries), expected.history);
  return {
    kinds: Object.keys(kinds).map((action) => `recurring.${action}`),
    consumedDeniedPendingPreserved: true,
    ownerOnlyReads: true,
    decisionsAndExecutionRefused: true,
  };
}

function approvalSnapshot(db, entries) {
  const ids = entries.map((entry) => `'${entry.approval}'`).join(",");
  return db.sql(`select jsonb_agg(to_jsonb(a) order by id)
    from public.nest_action_approvals a where id in (${ids})`);
}
