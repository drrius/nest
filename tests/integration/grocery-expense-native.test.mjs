import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { files, id } from "../database/ai-expense-fixture.mjs";
import { groceryMigration } from "../database/grocery-expense-fixture.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { householdTools } from "../../apps/api/src/assistant/tools.ts";
import { fixture as sqlite, run } from "../../apps/mobile/tests/offline-fixture.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { expenseSaveOperations } from "../../apps/mobile/src/money/save-operations.ts";
import { ExpenseSaveRuntime } from "../../apps/mobile/src/money/save-runtime.ts";
import {
  initialExpenseDraft,
  parseExpenseDraft,
} from "../../apps/mobile/src/money/expense-draft.ts";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect")),
  Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
async function fixture(t) {
  const f = await postgrestFixture(t, [
    ...files,
    "supabase/migrations/20260921130419_native_expense_save_cancel.sql",
    "supabase/migrations/20260921105214_native_money_detail_read.sql",
    groceryMigration,
    "tests/integration/food-postgrest.sql",
  ]);
  const server = nodeServer(
    createHandler({ url: f.url, publishableKey: "sb_publishable_fixture" }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const api = `http://127.0.0.1:${server.address().port}`;
  const local = await sqlite(t),
    identity = { actor: id(1), household: id(10) };
  const session = await run(local.store.activate(identity, id(990)));
  const clientAt = (url) => {
    const raw = moneyClient(
      url,
      identity,
      Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
    );
    return Object.fromEntries(
      Object.entries(raw).map(([key, method]) => [
        key,
        (...args) => method(...args).pipe(Effect.provideService(Fetch.Fetch, fetch)),
      ]),
    );
  };
  return { ...f, api, local, session, clientAt };
}
const expense = () =>
  parseExpenseDraft(
    { ...initialExpenseDraft(id(1), "2026-09-21", true), receiptTotal: "20.00", amount: "10.01" },
    [id(1), id(2)],
  ).expense;
test("grocery Save retains total and shared amount through actual lost response, SQLite restart and detail read", async (t) => {
  const f = await fixture(t),
    proxy = await lostResponseProxy(t, f.api, "/v1/money/expense/save");
  const client = f.clientAt(proxy.url);
  const runtime = new ExpenseSaveRuntime(
    expenseSaveOperations({ store: f.local.store, session: f.session }, client),
  );
  await runtime.setOnline(true);
  await runtime.setActive(true);
  const command = { operationId: id(100), expense: expense() };
  await runtime.save(command);
  assert.equal(runtime.getSnapshot().fresh, false);
  assert.equal(proxy.dropped(), 1);
  assert.deepEqual((await run(f.local.store.readExpenseSave(f.session))).command, command);
  runtime.dispose();
  const reopened = f.local.reopen();
  const recovered = new ExpenseSaveRuntime(
    expenseSaveOperations({ store: reopened.store, session: f.session }, client),
  );
  await recovered.setOnline(true);
  await recovered.setActive(true);
  const receipt = recovered.getSnapshot().result.receipt;
  assert.deepEqual(receipt.expense, command.expense);
  const detail = await run(client.detail(receipt.eventId));
  assert.equal(detail.receiptTotalCentimes, "2000");
  assert.equal(detail.event.amountCentimes, "1001");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(
    reopened.connection.prepare("select count(*) as n from offline_operations").get().n,
    0,
  );
  recovered.dispose();
});
test("real AI SDK grocery proposal carries both amounts into private native confirmation and posts only shared centimes", async (t) => {
  const f = await fixture(t);
  const turn = {
    conversationId: id(900),
    operationId: id(901),
    expectedRevision: "0",
    text: "Record groceries with CHF20 total and CHF10.01 shared",
  };
  const message = {
    id: turn.operationId,
    role: "user",
    parts: [{ type: "text", text: turn.text }],
  };
  f.db.sql(
    `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}'; select public.nest_begin_ai_turn('${id(10)}','${turn.conversationId}','${turn.operationId}',0,'${JSON.stringify(message)}'::jsonb)`,
  );
  const tools = householdTools(
    new Request("http://localhost", { headers: { authorization: `Bearer ${f.bearer}` } }),
    { url: f.url, publishableKey: "sb_publishable_fixture" },
    { householdId: id(10), turn },
  ).tools;
  const result = await tools.proposeExpense.execute(expense(), {
    toolCallId: "groceries",
    messages: [],
  });
  assert.equal(result.ok, true);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  const approval = result.value.approval,
    client = f.clientAt(f.api);
  const current = await run(client.approval(approval.id));
  assert.equal(current.expense.receiptTotalCentimes, "2000");
  const command = {
    operationId: approval.operationId,
    approvalId: approval.id,
    expense: current.expense,
    approved: true,
  };
  const confirmed = await run(client.decideExpense(command));
  assert.equal(confirmed.status, "consumed");
  assert.equal(confirmed.receipt.expense.amountCentimes, "1001");
  assert.equal(f.db.sql("select receipt_total_cents from public.nest_grocery_expenses"), "2000");
  assert.equal(f.db.sql("select amount_cents from public.financial_events"), "1001");
});
