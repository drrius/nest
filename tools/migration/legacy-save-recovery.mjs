import assert from "node:assert/strict";
import { as, id } from "../../tests/database/native-expense-helpers.mjs";
import { json, legacyApprovalInput } from "./legacy-approval-inputs.mjs";
const kinds = ["legacy_adoption", "legacy_confirmation", "legacy_dismissal"];
const read = (entry) =>
  `select public.nest_read_${entry.kind}('${id(11)}','${id(entry.operation)}')`;
const cancel = (entry) =>
  `select public.nest_cancel_${entry.kind}('${id(11)}','${id(entry.operation)}')`;
const save = (entry) => `select public.nest_save_${entry.kind}(
  '${id(11)}','${id(entry.operation)}',${json(entry.input)})`;

export function seedLegacySaveRecovery(db) {
  const today = db.sql(
    "select to_char((clock_timestamp() at time zone 'Europe/Zurich')::date,'YYYY-MM-DD')",
  );
  const entries = kinds.flatMap((kind, kindIndex) =>
    ["recorded", "cancelled", "unresolved"].map((status, index) => {
      const base = 4000 + kindIndex * 100 + index * 10;
      const entry = {
        kind,
        operation: base + 2,
        input: legacyApprovalInput(db, { kind, base, today }),
      };
      const receipt = status === "recorded" ? JSON.parse(db.sql(as(4, save(entry)))) : null;
      if (status === "cancelled") db.sql(as(4, cancel(entry)));
      entry.result = JSON.parse(db.sql(as(4, read(entry))));
      assert.equal(entry.result.status, status);
      assert.deepEqual(entry.result.receipt, receipt);
      return entry;
    }),
  );
  return { entries, operations: operationSnapshot(db, entries) };
}

export function verifyLegacySaveRecovery(db, expected) {
  for (const entry of expected.entries) {
    assert.deepEqual(JSON.parse(db.sql(as(4, read(entry)))), entry.result);
    const partner = JSON.parse(db.sql(as(5, read(entry))));
    assert.equal(partner.status, "unresolved");
    assert.equal(partner.receipt, null);
    assert.throws(() => db.sql(as(3, read(entry))), /Not authorized/);
    for (const role of ["anon", "service_role"])
      assert.throws(() => db.sql(`set role ${role}; ${read(entry)}`), /permission denied/);
    assert.throws(() => db.sql(as(4, save(entry))), /permission denied/);
    assert.throws(() => db.sql(as(4, cancel(entry))), /permission denied/);
  }
  assert.equal(operationSnapshot(db, expected.entries), expected.operations);
  return {
    kinds,
    recordedCancelledUnresolvedPreserved: true,
    partnerReceiptsHidden: true,
    savesAndCancellationsRefused: true,
  };
}

function operationSnapshot(db, entries) {
  const ids = entries.map((entry) => `'${id(entry.operation)}'`).join(",");
  const tables = [
    "nest_legacy_adoption_operations",
    "nest_legacy_confirmation_operations",
    "nest_legacy_draft_operations",
  ];
  const reads = tables
    .map(
      (table) => `'${table}',(select coalesce(jsonb_agg(to_jsonb(r) order by operation_id),'[]')
    from private.${table} r where operation_id in (${ids}))`,
    )
    .join(",");
  return db.sql(`select jsonb_build_object(${reads})`);
}
