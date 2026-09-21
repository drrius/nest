import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture, id, run } from "./recurring-manual-fixture.mjs";
import { fixture as sqlite } from "../../apps/mobile/tests/offline-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { ManualCycleSaveRuntime } from "../../apps/mobile/src/money/recurring-manual-save-runtime.ts";
import { manualCycleSaveOperations } from "../../apps/mobile/src/money/recurring-manual-save-operations.ts";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
async function open(runtime) {
  await runtime.setOnline(true);
  await runtime.setActive(true);
}
for (const action of ["save", "cancel"]) {
  test(`manual cycle ${action} response loss survives SQLite restart without automatic posting`, async (t) => {
    const f = await fixture(t),
      local = await sqlite(t);
    const session = await run(local.store.activate({ actor: id(1), household: id(10) }, id(900)));
    const proxy = await lostResponseProxy(
      t,
      f.url,
      `/v1/money/recurring/manual/${action === "save" ? "save" : "cancel-save"}`,
    );
    let sends = 0;
    const client = Object.fromEntries(
      Object.entries(f.client(proxy.url)).map(([key, method]) => [
        key,
        (...args) => {
          if (key === "saveManualCycle" || key === "cancelManualCycleSave") sends++;
          return method(...args).pipe(Effect.provideService(Fetch.Fetch, fetch));
        },
      ]),
    );
    const owner = (store) =>
      new ManualCycleSaveRuntime(manualCycleSaveOperations({ store, session }, client));
    if (action === "cancel")
      await run(
        local.store.stageManualCycleSave(
          session,
          { action: "save", command: f.command },
          () => true,
        ),
      );
    const runtime = owner(local.store);
    t.after(() => runtime.dispose());
    await open(runtime);
    if (action === "save") await runtime.save(f.command);
    else await runtime.abandon(runtime.getSnapshot().attempt);
    assert.equal(proxy.dropped(), 1);
    assert.equal(sends, 1);
    assert.equal(runtime.getSnapshot().fresh, false);
    assert.deepEqual(await run(local.store.readManualCycleSave(session)), {
      action,
      command: f.command,
    });
    runtime.dispose();
    const reopened = local.reopen(),
      recovered = owner(reopened.store);
    t.after(() => recovered.dispose());
    await open(recovered);
    const result = recovered.getSnapshot().result;
    assert.equal(result.status, action === "save" ? "recorded" : "cancelled");
    assert.equal(sends, 1);
    assert.equal(recovered.getSnapshot().attempt, null);
    assert.equal(await run(reopened.store.readManualCycleSave(session)), null);
    assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
    assert.equal(
      f.db.sql("select count(*) from public.nest_recurring_cycles"),
      action === "save" ? "1" : "0",
    );
    assert.equal(
      reopened.connection.prepare("select count(*) as count from offline_operations").get().count,
      0,
    );
    if (action === "save") {
      assert.deepEqual(result.receipt.input, f.command.input);
      assert.equal(result.receipt.linkedExpense.event.amountCentimes, "101");
    } else await assert.rejects(run(f.client().saveManualCycle(f.command)));
    await recovered.setActive(false);
    assert.equal(recovered.getSnapshot().result, null);
    await recovered.setActive(true);
    assert.deepEqual(recovered.getSnapshot().result, result);
    assert.equal(sends, 1);
  });
}
