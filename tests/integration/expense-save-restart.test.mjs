import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture as sqlite, run } from "../../apps/mobile/tests/offline-fixture.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { expenseSaveOperations } from "../../apps/mobile/src/money/save-operations.ts";
import { ExpenseSaveRuntime } from "../../apps/mobile/src/money/save-runtime.ts";
import { expenseApiFixture } from "./expense-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { id, payload } from "../database/native-expense-helpers.mjs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
for (const action of ["save", "cancel"]) {
  test(`direct ${action} recovers real response loss across SQLite restart with zero automatic sends`, async (t) => {
    const f = await expenseApiFixture(t),
      local = await sqlite(t);
    const account = { actor: id(1), household: id(10) },
      command = { operationId: id(100), expense: payload() };
    const session = await run(local.store.activate(account, id(900)));
    const proxy = await lostResponseProxy(t, f.url, `/v1/money/expense/${action}`);
    const raw = moneyClient(
      proxy.url,
      account,
      Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
    );
    let sends = 0;
    const client = {
      recoverExpense: (input) =>
        raw.recoverExpense(input).pipe(Effect.provideService(Fetch.Fetch, fetch)),
      saveExpense: (input) => {
        sends++;
        return raw.saveExpense(input).pipe(Effect.provideService(Fetch.Fetch, fetch));
      },
      cancelExpense: (input) => {
        sends++;
        return raw.cancelExpense(input).pipe(Effect.provideService(Fetch.Fetch, fetch));
      },
    };
    if (action === "cancel")
      await run(local.store.stageExpenseSave(session, { action: "save", command }, () => true));
    const runtime = new ExpenseSaveRuntime(
      expenseSaveOperations({ store: local.store, session }, client),
    );
    await runtime.setOnline(true);
    await runtime.setActive(true);
    if (action === "save") await runtime.save(command);
    else await runtime.cancel(runtime.getSnapshot().attempt);
    assert.equal(runtime.getSnapshot().fresh, false);
    assert.equal(proxy.dropped(), 1);
    assert.equal(sends, 1);
    assert.deepEqual(await run(local.store.readExpenseSave(session)), { action, command });
    runtime.dispose();
    const reopened = local.reopen();
    const recovered = new ExpenseSaveRuntime(
      expenseSaveOperations({ store: reopened.store, session }, client),
    );
    await recovered.setOnline(true);
    await recovered.setActive(true);
    assert.equal(
      recovered.getSnapshot().result.status,
      action === "save" ? "recorded" : "cancelled",
    );
    assert.equal(recovered.getSnapshot().attempt, null);
    assert.equal(sends, 1);
    assert.equal(await run(reopened.store.readExpenseSave(session)), null);
    assert.equal(
      f.db.sql("select count(*) from public.financial_events"),
      action === "save" ? "1" : "0",
    );
    assert.equal(
      reopened.connection.prepare("select count(*) as count from offline_operations").get().count,
      0,
    );
    recovered.dispose();
  });
}
