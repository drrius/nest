import assert from "node:assert/strict";
import { test } from "node:test";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { files, id } from "../database/expense-receipt-fixture.mjs";
import { payload } from "../database/native-expense-helpers.mjs";

test("unavailable receipt/category and cancelled expense Save reject without posting", async (t) => {
  const f = await postgrestFixture(t, [
    ...files,
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260926092453_native_ai_nonretryable_conflicts.sql",
    "supabase/migrations/20260926093435_native_expense_nonretryable_conflicts.sql",
  ]);
  const rpc = (name, body) =>
    fetch(`${f.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const before = f.db.sql("select count(*) from public.financial_events");
  assert.equal(
    (
      await rpc("nest_cancel_expense_save", {
        p_household: id(10),
        p_operation: id(802),
      })
    ).status,
    200,
  );
  for (const [operation, value] of [
    [id(800), payload({ categoryId: id(999) })],
    [id(801), payload({ receiptPath: `${id(10)}/receipts/${id(999)}.jpg` })],
    [id(802), payload()],
  ]) {
    const response = await rpc("nest_save_expense", {
      p_household: id(10),
      p_operation: operation,
      p_payload: value,
    });
    assert.equal(response.status, 412);
    assert.equal((await response.json()).code, "PT412");
    assert.equal(f.db.sql("select count(*) from public.financial_events"), before);
  }
});
