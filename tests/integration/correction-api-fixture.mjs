import { refundApiFixture } from "./refund-api-fixture.mjs";
import { id } from "../database/native-expense-helpers.mjs";
export { replacement } from "../database/native-correction-fixture.mjs";
export const correction = (sourceEventId, patch = {}) => ({
  sourceEventId,
  expectedReversalId: null,
  replacement: null,
  ...patch,
});
export async function correctionApiFixture(t, seed = true) {
  const f = await refundApiFixture(t, seed);
  for (const file of [
    "tests/database/legacy-money/opening-correction-lineage.sql",
    "tests/database/legacy-money/correction-command.sql",
    "supabase/migrations/20260921144718_native_grocery_expense.sql",
    "supabase/migrations/20260921160415_native_correction_command.sql",
    "supabase/migrations/20260921161115_native_correction_context.sql",
    "supabase/migrations/20260921161648_native_correction_save_cancel.sql",
    "supabase/migrations/20260921163322_native_correction_approval.sql",
  ])
    f.db.file(file);
  f.db.sql("notify pgrst,'reload schema'");
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await fetch(`${f.supabaseUrl}/rest/v1/rpc/nest_save_correction`, {
      method: "POST",
      headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
      body: JSON.stringify({ p_household: id(10), p_operation: id(999), p_payload: {} }),
    });
    if (response.status === 400) break;
    if (attempt === 99) throw Error("Correction RPC schema did not reload");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return f;
}
