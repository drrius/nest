import assert from "node:assert/strict";
import { as, id, payload } from "../../tests/database/native-expense-helpers.mjs";

const allocations = [
  { memberId: id(4), centimes: "51" },
  { memberId: id(5), centimes: "50" },
];
const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const read = (entry) =>
  `select public.nest_read_${entry.kind}_approval('${id(11)}','${entry.approval}')`;
const decide = (entry, approved) =>
  `select public.nest_decide_${entry.kind}('${id(11)}','${id(entry.operation)}',${json(entry.input)},'${entry.approval}',${approved})`;

// Independent synthetic sources keep one terminal decision from invalidating another proposal.
export function seedAdjustmentApprovalRecovery(db) {
  const entries = ["refund", "correction"].flatMap((kind, kindIndex) =>
    ["consumed", "denied", "pending"].map((status, index) =>
      seedEntry(db, { kind, status, operation: 1920 + kindIndex * 10 + index * 2 }),
    ),
  );
  return { entries, approvals: snapshot(db, entries) };
}

function seedEntry(db, { kind, status, operation }) {
  const source = JSON.parse(
    db.sql(
      as(
        4,
        `select public.nest_save_expense('${id(11)}','${id(operation)}',
      ${json(payload({ payerId: id(4), allocations }))})`,
      ),
    ),
  );
  const input =
    kind === "refund"
      ? {
          sourceEventId: source.eventId,
          description: "Synthetic approval recovery refund",
          amountCentimes: "101",
          payerId: id(4),
          allocations,
          expectedRemaining: allocations,
          date: "2026-09-25",
          note: null,
        }
      : { sourceEventId: source.eventId, expectedReversalId: null, replacement: null };
  const entry = { kind, input, operation: operation + 1, status };
  entry.approval = db.sql(
    as(
      4,
      `select public.nest_propose_action('${id(11)}',
    '${id(entry.operation)}','expenses.${kind === "correction" ? "correct" : "refund"}',1,${json(input)})`,
    ),
  );
  if (status !== "pending") db.sql(as(4, decide(entry, status === "consumed")));
  entry.result = JSON.parse(db.sql(as(4, read(entry))));
  assert.equal(entry.result.approval.status, status);
  assert.equal(entry.result.approval.receipt !== null, status === "consumed");
  return entry;
}

export function verifyAdjustmentApprovalRecovery(db, expected) {
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
  assert.equal(snapshot(db, expected.entries), expected.approvals);
  return {
    kinds: ["refund", "correction"],
    consumedDeniedPendingPreserved: true,
    ownerOnlyReads: true,
    decisionsAndExecutionRefused: true,
  };
}

function snapshot(db, entries) {
  const ids = entries.map((entry) => `'${entry.approval}'`).join(",");
  return db.sql(`select jsonb_agg(to_jsonb(a) order by id)
    from public.nest_action_approvals a where id in (${ids})`);
}
