import { expenseApiFixture } from "./expense-api-fixture.mjs";
import { id, payload } from "../database/native-expense-helpers.mjs";
export const settlement = (patch = {}) => ({
  description: "Settlement",
  amountCentimes: "1000",
  expectedOutstandingCentimes: "1000",
  payerId: id(2),
  recipientId: id(1),
  mode: "full",
  date: "2026-09-21",
  note: null,
  ...patch,
});
export async function settlementApiFixture(t, partner = id(2), seed = true) {
  const f = await expenseApiFixture(t);
  f.db.file("tests/database/legacy-money/settlement-command.sql");
  f.db.file("supabase/migrations/20260921134717_native_settlement_command.sql");
  f.db.file("supabase/migrations/20260921140302_native_settlement_approval.sql");
  f.db.file("supabase/migrations/20260921142513_native_settlement_save_cancel.sql");
  f.db.sql("notify pgrst,'reload schema'");
  // Wait for the actual new RPC to appear before testing its authenticated behavior.
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await fetch(`${f.supabaseUrl}/rest/v1/rpc/nest_save_settlement`, {
      method: "POST",
      headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
      body: JSON.stringify({ p_household: id(10), p_operation: id(999), p_payload: {} }),
    });
    if (response.status === 400) break;
    if (attempt === 99) throw Error("Settlement RPC schema did not reload");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (partner !== id(2))
    f.db.sql(
      `insert into auth.users(id) values('${partner}'); delete from public.household_members where user_id='${id(2)}'; insert into public.household_members(household_id,user_id,display_name) values('${id(10)}','${partner}','Partner')`,
    );
  if (!seed) return f;
  await f.rpc("nest_save_expense", {
    p_household: id(10),
    p_operation: id(900),
    p_payload: payload({
      amountCentimes: "1000",
      allocations: [
        { memberId: id(1), centimes: "0" },
        { memberId: partner, centimes: "1000" },
      ],
    }),
  });
  return f;
}
