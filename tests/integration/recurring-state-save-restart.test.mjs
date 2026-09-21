import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture as sqlite, run } from "../../apps/mobile/tests/offline-fixture.mjs";
import { recurringClient } from "../../apps/mobile/src/money/recurring-client.ts";
import { recurringStateSaveOperations } from "../../apps/mobile/src/money/recurring-state-save-operations.ts";
import { RecurringStateSaveRuntime } from "../../apps/mobile/src/money/recurring-state-save-runtime.ts";
import { recurringApiFixture, id } from "./recurring-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
for (const { action, stop } of [
  { action: "save", stop: "pause" },
  { action: "save", stop: "cancel" },
  { action: "cancel", stop: "pause" },
]) {
  test(`recurring state ${stop}/${action} recovers actual response loss after SQLite restart with no automatic send`, async (t) => {
    const { f, local, account, command } = await fixture(t, stop);
    const session = await run(local.store.activate(account, id(900)));
    const proxy = await lostResponseProxy(
      t,
      f.url,
      `/v1/money/recurring/state/${action === "cancel" ? "cancel-save" : "save"}`,
    );
    const raw = recurringClient(
      proxy.url,
      account,
      Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
    );
    let sends = 0;
    const client = {
      recoverRecurringState: (input) =>
        raw.recoverRecurringState(input).pipe(Effect.provideService(Fetch.Fetch, fetch)),
      saveRecurringState: (input) => {
        sends++;
        return raw.saveRecurringState(input).pipe(Effect.provideService(Fetch.Fetch, fetch));
      },
      cancelRecurringStateSave: (input) => {
        sends++;
        return raw.cancelRecurringStateSave(input).pipe(Effect.provideService(Fetch.Fetch, fetch));
      },
    };
    if (action === "cancel")
      await run(
        local.store.stageRecurringStateSave(session, { action: "save", command }, () => true),
      );
    const runtime = new RecurringStateSaveRuntime(
      recurringStateSaveOperations({ store: local.store, session }, client),
    );
    await runtime.setOnline(true);
    await runtime.setActive(true);
    if (action === "save") await runtime.save(command);
    else await runtime.abandon(runtime.getSnapshot().attempt);
    assert.equal(runtime.getSnapshot().fresh, false);
    assert.equal(proxy.dropped(), 1);
    assert.equal(sends, 1);
    assert.deepEqual(await run(local.store.readRecurringStateSave(session)), { action, command });
    runtime.dispose();
    const reopened = local.reopen();
    const recovered = new RecurringStateSaveRuntime(
      recurringStateSaveOperations({ store: reopened.store, session }, client),
    );
    await recovered.setOnline(true);
    await recovered.setActive(true);
    assert.equal(
      recovered.getSnapshot().result.status,
      action === "save" ? "recorded" : "cancelled",
    );
    assert.equal(
      f.db.sql("select status from public.nest_recurring_rules"),
      action === "cancel" ? "active" : stop === "pause" ? "paused" : "cancelled",
    );
    assert.equal(recovered.getSnapshot().attempt, null);
    assert.equal(sends, 1);
    assert.equal(await run(reopened.store.readRecurringStateSave(session)), null);
    assert.equal(
      f.db.sql("select count(*) from public.nest_recurring_revisions"),
      action === "save" ? "2" : "1",
    );
    assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
    assert.equal(
      reopened.connection.prepare("select count(*) as count from offline_operations").get().count,
      0,
    );
    recovered.dispose();
  });
}

async function fixture(t, stop) {
  const f = await recurringApiFixture(t, [
      "supabase/migrations/20260921210444_native_recurring_state_command.sql",
      "supabase/migrations/20260921211106_native_recurring_state_recovery.sql",
    ]),
    local = await sqlite(t);
  const saved = await run(f.client().saveRecurring({ operationId: id(600), rule: f.rule }));
  const account = { actor: id(1), household: id(10) },
    command = {
      operationId: id(700),
      change: {
        ruleId: f.rule.ruleId,
        expectedRevision: saved.revision,
        expectedStatus: "active",
        action: stop,
      },
    };

  return { f, local, account, command };
}
