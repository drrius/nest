import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { expenseApiFixture } from "./expense-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { expenseSaveTool } from "../../apps/api/src/money/expense-save-tool.ts";
import { id, payload } from "../database/native-expense-helpers.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const run = (effect) => Effect.runPromise(effect.pipe(Effect.provideService(Fetch.Fetch, fetch)));
const client = (f, actor = id(1), token = f.bearer, url = f.url) =>
  moneyClient(
    url,
    { actor, household: id(10) },
    Effect.succeed({ user: { id: actor }, access_token: token }),
  );
const command = { operationId: id(100), expense: payload() };
test("native and SDK Save recovery read a lost committed receipt without reposting or leaking to a partner", async (t) => {
  const f = await expenseApiFixture(t),
    proxy = await lostResponseProxy(t, f.url, "/v1/money/expense/save");
  const native = client(f, id(1), f.bearer, proxy.url);
  assert.equal((await run(native.recoverExpense(command))).status, "unresolved");
  await assert.rejects(run(native.saveExpense(command)), { code: "unavailable" });
  const { receipt } = await run(client(f).recoverExpense(command));
  assert.equal(receipt.operationId, command.operationId);
  assert.equal(receipt.approvalId, null);
  assert.equal(
    (await run(client(f, id(2), f.partnerBearer).recoverExpense(command))).status,
    "unresolved",
  );
  const request = new Request(f.url, {
    headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) },
  });
  const tool = expenseSaveTool(request, {
    url: f.supabaseUrl,
    publishableKey: "sb_publishable_fixture",
  });
  const value = await tool.execute(
    { operationId: command.operationId },
    { toolCallId: "recover", messages: [] },
  );
  assert.equal(value.ok, true);
  assert.deepEqual(value.value.receipt, receipt);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  const headers = { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) };
  assert.equal(
    (
      await fetch(`${f.url}/v1/money/expense/receipt?operationId=${id(100)}&actorId=${id(2)}`, {
        headers,
      })
    ).status,
    400,
  );
  const readUrl = `${f.url}/v1/money/expense/receipt?operationId=${id(100)}`;
  assert.equal((await fetch(readUrl, { method: "POST", headers })).status, 405);
  assert.equal((await fetch(readUrl, { headers })).headers.get("cache-control"), "no-store");
  assert.equal((await fetch(`${readUrl}&operationId=${id(100)}`, { headers })).status, 400);
  const denied = await fetch(
    `${f.supabaseUrl}/rest/v1/nest_expense_receipts?select=result&operation_id=eq.${id(100)}`,
    { headers: { authorization: `Bearer ${f.partnerBearer}` } },
  );
  assert.deepEqual(await denied.json(), []);
  assert.equal(proxy.dropped(), 1);
});
async function waitFor(db, condition) {
  for (let count = 0; count < 100; count++) {
    if (db.sql(`select count(*) from pg_stat_activity where ${condition}`) !== "0") return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw Error("Expected database wait did not occur");
}
test("missing receipt during a blocked Save is not a terminal failure; later recovery sees the single commit", async (t) => {
  const f = await expenseApiFixture(t),
    native = client(f);
  const holder = f.db.concurrent(
    `set application_name='save-recovery-holder'; begin; select private.lock_household_ledger('${id(10)}'); select pg_sleep(1.5); commit;`,
  );
  await waitFor(f.db, "application_name='save-recovery-holder' and wait_event='PgSleep'");
  const saving = run(native.saveExpense(command));
  await waitFor(f.db, "query like '%nest_save_expense%' and wait_event='advisory'");
  assert.equal((await run(native.recoverExpense(command))).status, "unresolved");
  await holder;
  const receipt = await saving;
  assert.deepEqual((await run(native.recoverExpense(command))).receipt, receipt);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});
test("revoked membership cannot recover even a missing Save receipt", async (t) => {
  const f = await expenseApiFixture(t),
    native = client(f);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await assert.rejects(run(native.recoverExpense(command)), { code: "forbidden" });
});

test("lost cancellation acknowledgement recovers a permanent outcome and blocks a late Save", async (t) => {
  const f = await expenseApiFixture(t),
    proxy = await lostResponseProxy(t, f.url, "/v1/money/expense/cancel");
  await assert.rejects(run(client(f, id(1), f.bearer, proxy.url).cancelExpense(command)), {
    code: "unavailable",
  });
  const native = client(f);
  assert.equal((await run(native.recoverExpense(command))).status, "cancelled");
  await assert.rejects(run(native.saveExpense(command)), { code: "conflict" });
  assert.equal((await run(native.cancelExpense(command))).status, "cancelled");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(proxy.dropped(), 1);
});
test("cancelling after a lost Save returns the recorded receipt without reversing history", async (t) => {
  const f = await expenseApiFixture(t),
    proxy = await lostResponseProxy(t, f.url, "/v1/money/expense/save");
  await assert.rejects(run(client(f, id(1), f.bearer, proxy.url).saveExpense(command)), {
    code: "unavailable",
  });
  const result = await run(client(f).cancelExpense(command));
  assert.equal(result.status, "recorded");
  assert.deepEqual(result.receipt.expense, command.expense);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_expense_save_cancellations"), "0");
});
