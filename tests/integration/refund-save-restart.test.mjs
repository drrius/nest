import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture as sqlite, run } from "../../apps/mobile/tests/offline-fixture.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { refundSaveOperations } from "../../apps/mobile/src/money/refund-save-operations.ts";
import { RefundSaveRuntime } from "../../apps/mobile/src/money/refund-save-runtime.ts";
import { refundApiFixture } from "./refund-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { id } from "../database/native-expense-helpers.mjs";
import { refund as payload } from "./refund-api-fixture.mjs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
for (const action of ["save", "cancel"]) {
  test(`direct ${action} recovers real response loss across SQLite restart with zero automatic sends`, async (t) => {
    const f = await refundApiFixture(t),
      local = await sqlite(t);
    const account = { actor: id(1), household: id(10) },
      command = { operationId: id(100), refund: payload(f.source) };
    const session = await run(local.store.activate(account, id(900)));
    const proxy = await lostResponseProxy(t, f.url, `/v1/money/refund/${action}`);
    const raw = moneyClient(
      proxy.url,
      account,
      Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
    );
    let sends = 0;
    const client = {
      recoverRefund: (input) =>
        raw.recoverRefund(input).pipe(Effect.provideService(Fetch.Fetch, fetch)),
      saveRefund: (input) => {
        sends++;
        return raw.saveRefund(input).pipe(Effect.provideService(Fetch.Fetch, fetch));
      },
      cancelRefund: (input) => {
        sends++;
        return raw.cancelRefund(input).pipe(Effect.provideService(Fetch.Fetch, fetch));
      },
    };
    if (action === "cancel")
      await run(local.store.stageRefundSave(session, { action: "save", command }, () => true));
    const runtime = new RefundSaveRuntime(
      refundSaveOperations({ store: local.store, session }, client),
    );
    await runtime.setOnline(true);
    await runtime.setActive(true);
    if (action === "save") await runtime.save(command);
    else await runtime.cancel(runtime.getSnapshot().attempt);
    assert.equal(runtime.getSnapshot().fresh, false);
    assert.equal(proxy.dropped(), 1);
    assert.equal(sends, 1);
    assert.deepEqual(await run(local.store.readRefundSave(session)), { action, command });
    runtime.dispose();
    const reopened = local.reopen();
    const recovered = new RefundSaveRuntime(
      refundSaveOperations({ store: reopened.store, session }, client),
    );
    await recovered.setOnline(true);
    await recovered.setActive(true);
    assert.equal(
      recovered.getSnapshot().result.status,
      action === "save" ? "recorded" : "cancelled",
    );
    assert.equal(recovered.getSnapshot().attempt, null);
    assert.equal(sends, 1);
    assert.equal(await run(reopened.store.readRefundSave(session)), null);
    assert.equal(
      f.db.sql("select count(*) from public.financial_events"),
      action === "save" ? "2" : "1",
    );
    assert.equal(
      reopened.connection.prepare("select count(*) as count from offline_operations").get().count,
      0,
    );
    recovered.dispose();
  });
}
