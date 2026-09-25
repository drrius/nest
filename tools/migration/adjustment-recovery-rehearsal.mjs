import assert from "node:assert/strict";
import { as, id, payload } from "../../tests/database/native-expense-helpers.mjs";

const allocations = [
  { memberId: id(4), centimes: "51" },
  { memberId: id(5), centimes: "50" },
];
const sql = (kind, operation, input) => `select public.nest_save_${kind}(
  '${id(11)}','${id(operation)}','${JSON.stringify(input)}'::jsonb)`;

export function seedRecoveryAdjustments(db) {
  return ["refund", "correction"].map((kind, index) => {
    const operation = 1860 + index * 10;
    const source = JSON.parse(
      db.sql(as(4, sql("expense", operation, payload({ payerId: id(4), allocations })))),
    );
    const input =
      kind === "refund"
        ? {
            sourceEventId: source.eventId,
            description: "Synthetic recovery refund",
            amountCentimes: "101",
            payerId: id(4),
            allocations,
            expectedRemaining: allocations,
            date: "2026-09-25",
            note: null,
          }
        : { sourceEventId: source.eventId, expectedReversalId: null, replacement: null };
    const receipt = JSON.parse(db.sql(as(4, sql(kind, operation + 1, input))));
    return {
      kind,
      operation: operation + 1,
      receipt,
      refusedWrite: sql(kind, operation + 2, input),
    };
  });
}

export function verifyRecoveryAdjustments(db, expected) {
  return expected.map(({ kind, operation, receipt, refusedWrite }) => {
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
        db.sql(as(4, `select public.nest_cancel_${kind}_save('${id(11)}','${id(operation + 3)}')`)),
      /permission denied/,
    );
    return {
      kind,
      ownerReceiptPreserved: true,
      partnerReceiptHidden: true,
      newWritesRefused: true,
    };
  });
}
