import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { files, id, json, payload } from "../database/ai-recurring-state-fixture.mjs";
import { householdTools } from "../../apps/api/src/assistant/tools.ts";
import { createHandler } from "../../apps/api/src/handler.ts";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { actionResult } from "../../apps/mobile/src/assistant/action-result.ts";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { recurringStateApprovalOperations } from "../../apps/mobile/src/money/recurring-state-approval-operations.ts";
import { recurringStateApprovalOwner } from "../../apps/mobile/src/money/recurring-state-approval-owner.ts";
import { recurringStateApprovalActions } from "../../apps/mobile/src/money/recurring-state-approval-display.ts";
import { fixture as sqlite, run } from "../../apps/mobile/tests/offline-fixture.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
async function api(t, config) {
  const server = nodeServer(createHandler(config));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  return `http://127.0.0.1:${server.address().port}`;
}
async function proposal(f, config) {
  const turn = {
    conversationId: id(900),
    operationId: id(901),
    expectedRevision: "0",
    text: "Pause this recurring expense",
  };
  const message = {
    id: turn.operationId,
    role: "user",
    parts: [{ type: "text", text: turn.text }],
  };
  f.db.sql(
    `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}'; select public.nest_begin_ai_turn('${id(10)}','${turn.conversationId}','${turn.operationId}',0,${json(message)})`,
  );
  const tools = householdTools(
    new Request("http://localhost/", { headers: { authorization: `Bearer ${f.bearer}` } }),
    config,
    { householdId: id(10), turn },
  ).tools;
  const input = payload(f.db);
  const result = await tools.proposeRecurringState.execute(input, {
    toolCallId: "recurring",
    messages: [],
  });
  assert.deepEqual(
    await tools.proposeRecurringState.execute(input, { toolCallId: "recurring", messages: [] }),
    result,
  );
  return result;
}
test("real AI tool returns a private native handoff; only exact confirmation pauses a recurring rule", async (t) => {
  const f = await postgrestFixture(t, [
    ...files,
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260921103207_native_money_balance_read.sql",
  ]);
  const config = { url: f.url, publishableKey: "sb_publishable_fixture" };
  const result = await proposal(f, config);
  assert.equal(result.ok, true);
  const card = actionResult({
    type: "tool-proposeRecurringState",
    state: "output-available",
    output: result,
  });
  assert.equal(card.href.pathname, "/recurring-state-approval");
  assert.match(card.label, /changed no rule or expense/);
  const url = await api(t, config),
    local = await sqlite(t);
  const account = { actor: id(1), household: id(10) },
    session = await run(local.store.activate(account, id(950)));
  const raw = moneyClient(
    url,
    account,
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
  const client = Object.fromEntries(
    ["recurringStateApproval", "recurringRule", "decideRecurringState"].map((name) => [
      name,
      (...args) => raw[name](...args).pipe(Effect.provideService(Fetch.Fetch, fetch)),
    ]),
  );
  const owner = recurringStateApprovalOwner(
    recurringStateApprovalOperations({ store: local.store, session }, client),
    card.href.params.approvalId,
  );
  const stop = owner.subscribe(() => {}),
    runtime = owner.getSnapshot();
  await runtime.setOnline(true);
  await runtime.setActive(true);
  const view = runtime.getSnapshot();
  assert.equal(recurringStateApprovalActions(view, Date.now()).confirm, true);
  assert.equal(f.db.sql("select status from public.nest_recurring_rules"), "active");
  await runtime.decide(view.approval, true);
  assert.equal(runtime.getSnapshot().approval.status, "consumed");
  assert.equal(f.db.sql("select status from public.nest_recurring_rules"), "paused");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  stop();
});
