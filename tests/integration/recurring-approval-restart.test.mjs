import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture as sqlite } from "../../apps/mobile/tests/offline-fixture.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { recurringApprovalOperations } from "../../apps/mobile/src/money/recurring-approval-operations.ts";
import { RecurringApprovalRuntime } from "../../apps/mobile/src/money/recurring-approval-runtime.ts";
import { recurringApiFixture, id, run } from "./recurring-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
for (const approved of [true, false]) {
  test(`recurring decision ${approved} survives SQLite restart and recovers a single committed decision`, async (t) => {
    const f = await recurringApiFixture(t, [
      "supabase/migrations/20260921201455_native_recurring_approval.sql",
    ]);
    const local = await sqlite(t),
      account = { actor: id(1), household: id(10) };
    const session = await run(local.store.activate(account, id(900)));
    const approvalId = await f.rpc("nest_propose_action", {
      p_household: id(10),
      p_invocation: id(700),
      p_command: "recurring.create",
      p_version: 1,
      p_payload: f.rule,
    });
    const proxy = await lostResponseProxy(t, f.url, "/v1/money/recurring/approval/decide");
    const raw = moneyClient(
      proxy.url,
      account,
      Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
    );
    let sends = 0;
    const client = Object.fromEntries(
      ["recurringApproval", "recurringRules", "recurringRule", "balance", "decideRecurring"].map(
        (name) => [
          name,
          (...args) => {
            if (name === "decideRecurring") sends++;
            return raw[name](...args).pipe(Effect.provideService(Fetch.Fetch, fetch));
          },
        ],
      ),
    );
    const runtime = new RecurringApprovalRuntime(
      recurringApprovalOperations({ store: local.store, session }, client),
      approvalId,
    );
    await runtime.setOnline(true);
    await runtime.setActive(true);
    const stale = runtime.getSnapshot().approval;
    await runtime.refresh();
    await runtime.decide(stale, approved);
    assert.equal(sends, 0);
    await runtime.decide(runtime.getSnapshot().approval, approved);
    assert.equal(sends, 1);
    assert.equal(proxy.dropped(), 1);
    const attempt = await run(local.store.readRecurringApproval(session, approvalId));
    assert.deepEqual(attempt, { approvalId, operationId: id(700), approved });
    await assert.rejects(
      run(
        local.store.stageRecurringApproval(
          session,
          { ...attempt, approved: !approved },
          () => true,
        ),
      ),
    );
    assert.equal(runtime.getSnapshot().fresh, false);
    runtime.dispose();
    const reopened = local.reopen();
    const recovered = new RecurringApprovalRuntime(
      recurringApprovalOperations({ store: reopened.store, session }, client),
      approvalId,
    );
    await recovered.setOnline(true);
    await recovered.setActive(true);
    assert.equal(recovered.getSnapshot().approval.status, approved ? "consumed" : "denied");
    assert.equal(recovered.getSnapshot().attempt, null);
    assert.equal(sends, 1);
    assert.equal(await run(reopened.store.readRecurringApproval(session, approvalId)), null);
    assert.equal(
      f.db.sql("select count(*) from public.nest_recurring_revisions"),
      approved ? "1" : "0",
    );
    assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
    await recovered.setActive(false);
    assert.equal(recovered.getSnapshot().approval, null);
    recovered.dispose();
  });
}
