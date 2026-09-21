import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture as sqlite, run } from "../../apps/mobile/tests/offline-fixture.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { expenseEntryOptions } from "../../apps/mobile/src/money/entry-options.ts";
import { expenseSaveOperations } from "../../apps/mobile/src/money/save-operations.ts";
import { ExpenseSaveRuntime } from "../../apps/mobile/src/money/save-runtime.ts";
import {
  initialExpenseDraft,
  parseExpenseDraft,
} from "../../apps/mobile/src/money/expense-draft.ts";
import { expenseApiFixture } from "./expense-api-fixture.mjs";
import { id } from "../database/native-expense-helpers.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect")),
  Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
async function fixture(t) {
  const f = await expenseApiFixture(t),
    local = await sqlite(t);
  f.db.file("supabase/migrations/20260921123952_native_expense_category_read.sql");
  f.db.sql(
    `insert into public.expense_categories(id,household_id,name,sort_order) values('${id(500)}','${id(10)}','Home',0)`,
  );
  const identity = { actor: id(1), household: id(10) },
    session = await run(local.store.activate(identity, id(900))),
    account = { store: local.store, session };
  const raw = moneyClient(
    f.url,
    identity,
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
  const client = Object.fromEntries(
    Object.entries(raw).map(([key, method]) => [
      key,
      (...args) => method(...args).pipe(Effect.provideService(Fetch.Fetch, fetch)),
    ]),
  );
  const options = await run(expenseEntryOptions(account, client, null));
  const runtime = new ExpenseSaveRuntime(expenseSaveOperations(account, client));
  await runtime.setOnline(true);
  await runtime.setActive(true);
  t.after(() => runtime.dispose());
  return { ...f, local, account, options, runtime };
}
function draft(options, split = "equal") {
  const initial = initialExpenseDraft(id(1), "2026-09-21");
  return parseExpenseDraft(
    {
      ...initial,
      description: "Native entry",
      amount: "10.01",
      split,
      firstExact: "2.01",
      secondExact: "8",
      firstPercent: "25",
      categoryId: options.categories.categories[0].categoryId,
    },
    options.members.map((member) => member.actorId),
  );
}
test("native entry reads real member/category choices and records all split modes through durable runtime", async (t) => {
  const f = await fixture(t);
  assert.equal(f.options.members.length, 2);
  assert.equal(f.options.categories.categories[0].name, "Home");
  for (const [index, split] of ["equal", "exact", "percentage"].entries()) {
    const parsed = draft(f.options, split);
    assert.equal(parsed.ok, true);
    await f.runtime.save({ operationId: id(100 + index), expense: parsed.expense });
    const view = f.runtime.getSnapshot();
    assert.equal(view.result?.status, "recorded", view.notice);
    assert.deepEqual(view.result.receipt.expense, parsed.expense);
    assert.equal(await run(f.account.store.readExpenseSave(f.account.session)), null);
    f.runtime.acknowledge();
  }
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "3");
});
test("archived category rejects Save, explicit cancellation releases only that attempt, and current choices can be reread", async (t) => {
  const f = await fixture(t),
    parsed = draft(f.options);
  f.db.sql(`update public.expense_categories set archived_at=now() where id='${id(500)}'`);
  await f.runtime.save({ operationId: id(100), expense: parsed.expense });
  assert.equal(f.runtime.getSnapshot().fresh, false);
  assert.equal(f.runtime.getSnapshot().attempt.command.operationId, id(100));
  await f.runtime.refresh();
  assert.equal(f.runtime.getSnapshot().result.status, "unresolved");
  await f.runtime.cancel(f.runtime.getSnapshot().attempt);
  assert.equal(f.runtime.getSnapshot().result.status, "cancelled");
  f.runtime.acknowledge();
  await f.runtime.save({ operationId: id(101), expense: { ...parsed.expense, categoryId: null } });
  assert.equal(f.runtime.getSnapshot().result.status, "recorded");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});
