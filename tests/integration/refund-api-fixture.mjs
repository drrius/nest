import { expenseApiFixture } from "./expense-api-fixture.mjs";
import { id, payload } from "../database/native-expense-helpers.mjs";
export const refund = (sourceEventId, patch = {}) => ({
  sourceEventId,
  description: "Refund",
  amountCentimes: "300",
  payerId: id(1),
  allocations: [
    { memberId: id(1), centimes: "100" },
    { memberId: id(2), centimes: "200" },
  ],
  expectedRemaining: [
    { memberId: id(1), centimes: "400" },
    { memberId: id(2), centimes: "600" },
  ],
  date: "2026-09-21",
  note: null,
  ...patch,
});
export async function refundApiFixture(t) {
  const f = await expenseApiFixture(t);
  for (const file of [
    "tests/database/legacy-money/refund-command.sql",
    "supabase/migrations/20260921105214_native_money_detail_read.sql",
    "supabase/migrations/20260921151001_native_refund_command.sql",
  ])
    f.db.file(file);
  f.db.sql("notify pgrst,'reload schema'");
  // Wait for the actual new RPC to appear before testing its authenticated behavior.
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await fetch(`${f.supabaseUrl}/rest/v1/rpc/nest_save_refund`, {
      method: "POST",
      headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
      body: JSON.stringify({ p_household: id(10), p_operation: id(999), p_payload: {} }),
    });
    if (response.status === 400) break;
    if (attempt === 99) throw Error("Refund RPC schema did not reload");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const receipt = await f.rpc("nest_save_expense", {
    p_household: id(10),
    p_operation: id(900),
    p_payload: payload({
      amountCentimes: "1000",
      allocations: [
        { memberId: id(1), centimes: "400" },
        { memberId: id(2), centimes: "600" },
      ],
    }),
  });
  return { ...f, source: receipt.eventId };
}
