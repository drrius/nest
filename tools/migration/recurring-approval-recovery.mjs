import assert from "node:assert/strict";
import { as, id } from "../../tests/database/native-expense-helpers.mjs";

const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const read = (entry) =>
  `select public.nest_read_${entry.kind}_approval('${id(11)}','${entry.approval}')`;
const decide = (entry, approved) => `select public.nest_decide_${entry.kind}(
  '${id(11)}','${id(entry.operation)}',${json(entry.input)},'${entry.approval}',${approved})`;
const allocations = [
  { memberId: id(4), centimes: "51" },
  { memberId: id(5), centimes: "50" },
];

export function seedRecurringApprovalRecovery(db) {
  const today = db.sql(
    "select to_char((clock_timestamp() at time zone 'Europe/Zurich')::date,'YYYY-MM-DD')",
  );
  const entries = ["recurring", "recurring_state", "variable_cycle"].flatMap((kind, kindIndex) =>
    ["consumed", "denied", "pending"].map((status, index) =>
      seedEntry(db, { kind, status, base: 2000 + kindIndex * 30 + index * 4, today }),
    ),
  );
  return { entries, history: approvalSnapshot(db, entries) };
}

function inputFor(db, { kind, base, today }) {
  const input = {
    ruleId: id(base),
    expectedRevision: null,
    configuration: {
      description: "Synthetic recurring approval recovery",
      mode: "variable",
      amountCentimes: null,
      allocations: null,
      payerId: id(4),
      categoryId: null,
      note: null,
      startDate: today,
      schedule: { kind: "monthly", dayOfMonth: Number(today.slice(8)) },
    },
    firstDueOn: today,
  };
  if (kind === "recurring") return input;
  const created = JSON.parse(
    db.sql(
      as(
        4,
        `select public.nest_save_recurring(
    '${id(11)}','${id(base + 1)}',${json(input)})`,
      ),
    ),
  );
  const version = { ruleId: input.ruleId, expectedRevision: created.revision };
  return kind === "recurring_state"
    ? { ...version, expectedStatus: "active", action: "pause" }
    : { ...version, dueOn: today, amountCentimes: "101", allocations };
}

function seedEntry(db, specification) {
  const { kind, status, base } = specification;
  const input = inputFor(db, specification);
  const command = {
    recurring: "recurring.create",
    recurring_state: "recurring.pause",
    variable_cycle: "recurring.record-cycle",
  }[kind];
  const entry = { kind, input, operation: base + 2 };
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
    kinds: ["recurring.create", "recurring.pause", "recurring.record-cycle"],
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
