import assert from "node:assert/strict";
import { as, id } from "../../tests/database/native-expense-helpers.mjs";
import { json, legacyApprovalInput } from "./legacy-approval-inputs.mjs";
const commands = {
  legacy_adoption: "recurring.adopt-legacy",
  legacy_confirmation: "recurring.confirm-legacy-draft",
  legacy_dismissal: "recurring.dismiss-legacy-draft",
};
const read = (entry) =>
  `select public.nest_read_${entry.kind}_approval('${id(11)}','${entry.approval}')`;
const decide = (entry, approved) => `select public.nest_decide_${entry.kind}(
  '${id(11)}','${id(entry.operation)}',${json(entry.input)},'${entry.approval}',${approved})`;

export function seedLegacyApprovalRecovery(db) {
  const today = db.sql(
    "select to_char((clock_timestamp() at time zone 'Europe/Zurich')::date,'YYYY-MM-DD')",
  );
  const entries = Object.keys(commands).flatMap((kind, kindIndex) =>
    ["consumed", "denied", "pending"].map((status, index) =>
      seedEntry(db, { kind, status, base: 3000 + kindIndex * 100 + index * 10, today }),
    ),
  );
  return { entries, history: snapshot(db, entries) };
}
function seedEntry(db, specification) {
  const { kind, status, base } = specification;
  const entry = { kind, operation: base + 2, input: legacyApprovalInput(db, specification) };
  entry.approval = db.sql(
    as(
      4,
      `select public.nest_propose_action('${id(11)}',
    '${id(entry.operation)}','${commands[kind]}',1,${json(entry.input)})`,
    ),
  );
  if (status !== "pending") db.sql(as(4, decide(entry, status === "consumed")));
  entry.result = JSON.parse(db.sql(as(4, read(entry))));
  assert.equal(entry.result.approval.status, status);
  assert.equal(entry.result.approval.receipt !== null, status === "consumed");
  return entry;
}
export function verifyLegacyApprovalRecovery(db, expected) {
  for (const entry of expected.entries) {
    assert.deepEqual(JSON.parse(db.sql(as(4, read(entry)))), entry.result);
    for (const actor of [5, 3])
      assert.throws(() => db.sql(as(actor, read(entry))), /Not authorized/);
    for (const role of ["anon", "service_role"])
      assert.throws(() => db.sql(`set role ${role}; ${read(entry)}`), /permission denied/);
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
  assert.equal(snapshot(db, expected.entries), expected.history);
  return {
    kinds: Object.values(commands),
    consumedDeniedPendingPreserved: true,
    ownerOnlyReads: true,
    decisionsAndExecutionRefused: true,
    legacyRecordsPreserved: true,
  };
}
function snapshot(db, entries) {
  const ids = entries.map((entry) => `'${entry.approval}'`).join(",");
  return db.sql(`select jsonb_build_object(
    'approvals',(select jsonb_agg(to_jsonb(a) order by id) from public.nest_action_approvals a where id in (${ids})),
    'rules',(select jsonb_agg(to_jsonb(r) order by id) from public.recurring_expense_rules r),
    'drafts',(select jsonb_agg(to_jsonb(d) order by id) from public.expense_drafts d),
    'adoptions',(select jsonb_agg(to_jsonb(a) order by to_jsonb(a)::text) from private.nest_legacy_recurring_adoptions a))`);
}
