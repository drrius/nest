import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { expenseApiFixture } from "./expense-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import {
  initialExpenseDraft,
  parseExpenseDraft,
} from "../../apps/mobile/src/money/expense-draft.ts";
import { id } from "../database/native-expense-helpers.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const run = (effect) => Effect.runPromise(effect.pipe(Effect.provideService(Fetch.Fetch, fetch)));
test("native expense draft modes post exact allocations and recover a committed Save response once", async (t) => {
  const f = await expenseApiFixture(t);
  const proxy = await lostResponseProxy(t, f.url, "/v1/money/expense/save");
  const client = moneyClient(
    proxy.url,
    { actor: id(1), household: id(10) },
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
  const base = {
    ...initialExpenseDraft(id(2), "2026-09-21"),
    description: "Household expense",
    amount: "1,01",
  };
  const drafts = [
    base,
    { ...base, split: "percentage", firstPercent: "75" },
    { ...base, split: "exact", firstExact: "0.01", secondExact: "1.00" },
  ];
  for (const [index, draft] of drafts.entries()) {
    const parsed = parseExpenseDraft(draft, [id(1), id(2)]);
    assert.equal(parsed.ok, true);
    const command = { operationId: id(100 + index), expense: parsed.expense };
    if (index === 0)
      await assert.rejects(run(client.saveExpense(command)), { code: "unavailable" });
    const receipt = await run(client.saveExpense(command));
    assert.equal(receipt.approvalId, null);
    assert.deepEqual(receipt.expense, parsed.expense);
    assert.deepEqual(await run(client.saveExpense(command)), receipt);
    const shares = JSON.parse(
      f.db.sql(
        `select json_agg(json_build_object('memberId',member_id,'centimes',allocated_cents::text) order by member_id) from public.financial_allocations where financial_event_id='${receipt.eventId}'`,
      ),
    );
    assert.deepEqual(
      shares,
      [...parsed.expense.allocations].sort((a, b) => a.memberId.localeCompare(b.memberId)),
    );
    await assert.rejects(
      run(client.saveExpense({ ...command, expense: { ...command.expense, note: "Changed" } })),
      { code: "invalid" },
    );
  }
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "3");
  assert.equal(f.db.sql("select count(*) from public.nest_expense_receipts"), "3");
  assert.equal(proxy.dropped(), 1);
});
