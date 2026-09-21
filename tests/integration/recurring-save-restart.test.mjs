import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture as sqlite, run } from "../../apps/mobile/tests/offline-fixture.mjs";
import { recurringClient } from "../../apps/mobile/src/money/recurring-client.ts";
import { recurringSaveOperations } from "../../apps/mobile/src/money/recurring-save-operations.ts";
import { RecurringSaveRuntime } from "../../apps/mobile/src/money/recurring-save-runtime.ts";
import { recurringApiFixture, id } from "./recurring-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
for (const action of ["save", "cancel"]) {
  test(`recurring ${action} recovers actual response loss after SQLite restart with no automatic send`, async (t) => {
    const f = await recurringApiFixture(t),
      local = await sqlite(t);
    const account = { actor: id(1), household: id(10) },
      command = { operationId: id(700), rule: f.rule };
    const session = await run(local.store.activate(account, id(900)));
    const proxy = await lostResponseProxy(
      t,
      f.url,
      `/v1/money/recurring/${action === "cancel" ? "cancel-save" : "save"}`,
    );
    const raw = recurringClient(
      proxy.url,
      account,
      Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
    );
    let sends = 0;
    const client = {
      recoverRecurring: (input) =>
        raw.recoverRecurring(input).pipe(Effect.provideService(Fetch.Fetch, fetch)),
      saveRecurring: (input) => {
        sends++;
        return raw.saveRecurring(input).pipe(Effect.provideService(Fetch.Fetch, fetch));
      },
      cancelRecurringSave: (input) => {
        sends++;
        return raw.cancelRecurringSave(input).pipe(Effect.provideService(Fetch.Fetch, fetch));
      },
    };
    if (action === "cancel")
      await run(local.store.stageRecurringSave(session, { action: "save", command }, () => true));
    const runtime = new RecurringSaveRuntime(
      recurringSaveOperations({ store: local.store, session }, client),
    );
    await runtime.setOnline(true);
    await runtime.setActive(true);
    if (action === "save") await runtime.save(command);
    else await runtime.cancel(runtime.getSnapshot().attempt);
    assert.equal(runtime.getSnapshot().fresh, false);
    assert.equal(proxy.dropped(), 1);
    assert.equal(sends, 1);
    assert.deepEqual(await run(local.store.readRecurringSave(session)), { action, command });
    runtime.dispose();
    const reopened = local.reopen();
    const recovered = new RecurringSaveRuntime(
      recurringSaveOperations({ store: reopened.store, session }, client),
    );
    await recovered.setOnline(true);
    await recovered.setActive(true);
    assert.equal(
      recovered.getSnapshot().result.status,
      action === "save" ? "recorded" : "cancelled",
    );
    assert.equal(recovered.getSnapshot().attempt, null);
    assert.equal(sends, 1);
    assert.equal(await run(reopened.store.readRecurringSave(session)), null);
    assert.equal(
      f.db.sql("select count(*) from public.nest_recurring_revisions"),
      action === "save" ? "1" : "0",
    );
    assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
    assert.equal(
      reopened.connection.prepare("select count(*) as count from offline_operations").get().count,
      0,
    );
    recovered.dispose();
  });
}
