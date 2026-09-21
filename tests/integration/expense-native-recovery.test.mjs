import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture as sqlite, run } from "../../apps/mobile/tests/offline-fixture.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { expenseApprovalOperations } from "../../apps/mobile/src/money/approval-operations.ts";
import { ExpenseApprovalRuntime } from "../../apps/mobile/src/money/approval-runtime.ts";
import { expenseApiFixture } from "./expense-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { id, payload } from "../database/native-expense-helpers.mjs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
for (const approved of [true, false]) {
  test(`native ${approved ? "confirmation" : "denial"} recovers after real response loss and SQLite restart`, async (t) => {
    const f = await expenseApiFixture(t),
      local = await sqlite(t);
    const account = { actor: id(1), household: id(10) };
    const session = await run(local.store.activate(account, id(900)));
    const approvalId = await f.rpc("nest_propose_action", {
      p_household: id(10),
      p_invocation: id(100),
      p_command: "expenses.record",
      p_version: 1,
      p_payload: payload(),
    });
    const proxy = await lostResponseProxy(t, f.url, "/v1/money/approval/decide");
    const raw = moneyClient(
      proxy.url,
      account,
      Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
    );
    const client = {
      approval: (target) => raw.approval(target).pipe(Effect.provideService(Fetch.Fetch, fetch)),
      decideExpense: (input) =>
        raw.decideExpense(input).pipe(Effect.provideService(Fetch.Fetch, fetch)),
    };
    const runtime = new ExpenseApprovalRuntime(
      expenseApprovalOperations({ store: local.store, session }, client),
      approvalId,
    );
    await runtime.setActive(true);
    assert.equal(runtime.getSnapshot().approval.status, "pending");
    await runtime.decide(runtime.getSnapshot().approval, approved);
    assert.equal(runtime.getSnapshot().fresh, false);
    assert.equal(proxy.dropped(), 1);
    assert.equal(
      (await run(local.store.readExpenseApproval(session, approvalId))).approved,
      approved,
    );
    runtime.dispose();
    const reopened = local.reopen();
    let sends = 0;
    const guarded = {
      ...client,
      decideExpense: (input) => {
        sends++;
        return client.decideExpense(input);
      },
    };
    const recovered = new ExpenseApprovalRuntime(
      expenseApprovalOperations({ store: reopened.store, session }, guarded),
      approvalId,
    );
    await recovered.setActive(true);
    assert.equal(recovered.getSnapshot().approval.status, approved ? "consumed" : "denied");
    assert.equal(recovered.getSnapshot().attempt, null);
    assert.equal(sends, 0);
    assert.equal(f.db.sql("select count(*) from public.financial_events"), approved ? "1" : "0");
    assert.equal(await run(reopened.store.readExpenseApproval(session, approvalId)), null);
    recovered.dispose();
  });
}
