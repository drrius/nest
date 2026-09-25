import assert from "node:assert/strict";
import { as, id, payload as expensePayload } from "../../tests/database/native-expense-helpers.mjs";

export function seedRecoverySettlement(db) {
  // The retained-history stress household deliberately exceeds new-command limits.
  // Preserve it unchanged and exercise a valid settlement in a second fixture household.
  db.sql(`insert into auth.users(id) values('${id(4)}'),('${id(5)}');
    insert into public.households(id,name) values('${id(11)}','Synthetic settlement household');
    insert into public.household_members(household_id,user_id,display_name) values
    ('${id(11)}','${id(4)}','First'),('${id(11)}','${id(5)}','Second');`);
  db.sql(
    as(
      4,
      `select public.nest_save_expense('${id(11)}','${id(1852)}',
    '${JSON.stringify(
      expensePayload({
        payerId: id(4),
        allocations: [
          { memberId: id(4), centimes: "51" },
          { memberId: id(5), centimes: "50" },
        ],
      }),
    )}'::jsonb)`,
    ),
  );
  const balance = BigInt(
    db.sql(`select coalesce(sum(receivable_delta_cents),0)
    from public.ledger_entries where household_id='${id(11)}' and member_id='${id(4)}'`),
  );
  assert.notEqual(balance, 0n, "The recovery fixture needs an outstanding balance");
  const payload = {
    description: "Synthetic recovery settlement",
    amountCentimes: "1",
    expectedOutstandingCentimes: (balance < 0n ? -balance : balance).toString(),
    payerId: id(balance > 0n ? 5 : 4),
    recipientId: id(balance > 0n ? 4 : 5),
    mode: "partial",
    date: "2026-09-25",
    note: null,
  };
  const save = (operation) => `select public.nest_save_settlement(
    '${id(11)}','${id(operation)}','${JSON.stringify(payload)}'::jsonb)`;
  const receipt = JSON.parse(db.sql(as(4, save(1850))));
  return { receipt, refusedWrite: save(1851) };
}

export function verifyRecoverySettlement(db, expected) {
  const read = `select public.nest_read_settlement_save('${id(11)}','${id(1850)}')`;
  const recovered = JSON.parse(db.sql(as(4, read)));
  assert.equal(recovered.status, "recorded");
  assert.deepEqual(recovered.receipt, expected.receipt);
  const partner = JSON.parse(db.sql(as(5, read)));
  assert.equal(partner.status, "unresolved");
  assert.equal(partner.receipt, null);
  assert.throws(() => db.sql(as(3, read)), /Not authorized/);
  assert.throws(() => db.sql(as(4, expected.refusedWrite)), /permission denied/);
  return { ownerReceiptPreserved: true, partnerReceiptHidden: true, newWriteRefused: true };
}
