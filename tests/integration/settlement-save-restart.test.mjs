import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture as sqlite, run } from "../../apps/mobile/tests/offline-fixture.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { settlementSaveOperations } from "../../apps/mobile/src/money/settlement-save-operations.ts";
import { SettlementSaveRuntime } from "../../apps/mobile/src/money/settlement-save-runtime.ts";
import { settlementApiFixture } from "./settlement-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { id } from "../database/native-expense-helpers.mjs";
import { settlement as payload } from "./settlement-api-fixture.mjs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
for (const action of ["save", "cancel"]) {
  test(`direct ${action} recovers real response loss across SQLite restart with Save and Cancel suspended`, async (t) => {
    const f = await settlementApiFixture(t),
      local = await sqlite(t);
    const account = { actor: id(1), household: id(10) },
      command = { operationId: id(100), settlement: payload() };
    const session = await run(local.store.activate(account, id(900)));
    const proxy = await lostResponseProxy(t, f.url, `/v1/money/settlement/${action}`);
    const raw = moneyClient(
      proxy.url,
      account,
      Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
    );
    let sends = 0;
    const client = {
      recoverSettlement: (input) =>
        raw.recoverSettlement(input).pipe(Effect.provideService(Fetch.Fetch, fetch)),
      saveSettlement: (input) => {
        sends++;
        return raw.saveSettlement(input).pipe(Effect.provideService(Fetch.Fetch, fetch));
      },
      cancelSettlement: (input) => {
        sends++;
        return raw.cancelSettlement(input).pipe(Effect.provideService(Fetch.Fetch, fetch));
      },
    };
    if (action === "cancel")
      await run(local.store.stageSettlementSave(session, { action: "save", command }, () => true));
    const runtime = new SettlementSaveRuntime(
      settlementSaveOperations({ store: local.store, session }, client),
    );
    await runtime.setOnline(true);
    await runtime.setActive(true);
    if (action === "save") await runtime.save(command);
    else await runtime.cancel(runtime.getSnapshot().attempt);
    assert.equal(runtime.getSnapshot().fresh, false);
    assert.equal(proxy.dropped(), 1);
    assert.equal(sends, 1);
    assert.deepEqual(await run(local.store.readSettlementSave(session)), { action, command });
    runtime.dispose();
    suspendWrites(f.db);
    const reopened = local.reopen();
    const recovered = new SettlementSaveRuntime(
      settlementSaveOperations({ store: reopened.store, session }, client),
    );
    await recovered.setOnline(true);
    await recovered.setActive(true);
    assert.equal(
      recovered.getSnapshot().result.status,
      action === "save" ? "recorded" : "cancelled",
    );
    assert.equal(recovered.getSnapshot().attempt, null);
    assert.equal(sends, 1);
    assert.equal(await run(reopened.store.readSettlementSave(session)), null);
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

function suspendWrites(db) {
  db.sql(`revoke all on function public.nest_save_settlement(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
    revoke all on function public.nest_cancel_settlement_save(uuid,uuid) from public,anon,authenticated,service_role;`);
  for (const call of [
    `public.nest_save_settlement('${id(10)}','${id(101)}','${JSON.stringify(payload())}'::jsonb)`,
    `public.nest_cancel_settlement_save('${id(10)}','${id(101)}')`,
  ])
    assert.throws(
      () => db.sql(`set role authenticated; set request.jwt.claim.sub='${id(1)}'; select ${call}`),
      /permission denied/,
    );
}
