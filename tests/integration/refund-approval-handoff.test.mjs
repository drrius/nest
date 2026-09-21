import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { files, id } from "../database/ai-refund-fixture.mjs";
import { refund as payload } from "./refund-api-fixture.mjs";
import { expense } from "../database/money-expense-helpers.mjs";
import { householdTools } from "../../apps/api/src/assistant/tools.ts";
import { createHandler } from "../../apps/api/src/handler.ts";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { actionResult } from "../../apps/mobile/src/assistant/action-result.ts";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { refundApprovalOperations } from "../../apps/mobile/src/money/refund-approval-operations.ts";
import { refundApprovalOwner } from "../../apps/mobile/src/money/refund-approval-owner.ts";
import {
  approvalActions,
  refundConfirmation,
} from "../../apps/mobile/src/money/refund-approval-display.ts";
import { fixture as sqlite, run } from "../../apps/mobile/tests/offline-fixture.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
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
    text: "Record this shared refund",
  };
  const message = {
    id: turn.operationId,
    role: "user",
    parts: [{ type: "text", text: turn.text }],
  };
  f.db.sql(
    `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}'; select public.nest_begin_ai_turn('${id(10)}','${turn.conversationId}','${turn.operationId}',0,'${JSON.stringify(message)}'::jsonb)`,
  );
  const tools = householdTools(
    new Request("http://localhost/", { headers: { authorization: `Bearer ${f.bearer}` } }),
    config,
    { householdId: id(10), turn },
  ).tools;
  return tools.proposeRefund.execute(payload(f.source), {
    toolCallId: "refund",
    messages: [],
  });
}
test("real AI proposal card opens native review and records only after exact explicit confirmation", async (t) => {
  const f = await postgrestFixture(t, [...files, "tests/integration/food-postgrest.sql"]);
  f.source = JSON.parse(
    f.db.sql(
      `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}'; ${expense("handoff-seed", { amount: 1000, own: 400 })}`,
    ),
  ).financial_event_id;
  const config = { url: f.url, publishableKey: "sb_publishable_fixture" };
  const result = await proposal(f, config);
  assert.equal(result.ok, true);
  const card = actionResult({
    type: "tool-proposeRefund",
    state: "output-available",
    output: result,
  });
  assert.equal(card.href.pathname, "/refund-approval");
  const url = await api(t, config),
    local = await sqlite(t);
  const account = { actor: id(1), household: id(10) };
  const session = await run(local.store.activate(account, id(950)));
  const raw = moneyClient(
    url,
    account,
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
  const provided = (effect) => effect.pipe(Effect.provideService(Fetch.Fetch, fetch));
  const client = {
    refundApproval: (target) => provided(raw.refundApproval(target)),
    decideRefund: (input) => provided(raw.decideRefund(input)),
  };
  const owner = refundApprovalOwner(
    refundApprovalOperations({ store: local.store, session }, client),
    card.href.params.approvalId,
  );
  const stop = owner.subscribe(() => {}),
    runtime = owner.getSnapshot();
  await runtime.setOnline(true);
  await runtime.setActive(true);
  const view = runtime.getSnapshot();
  assert.equal(approvalActions(view, Date.now()).confirm, true);
  assert.match(refundConfirmation(view.approval, id(1)), /Original payer: You/);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  await runtime.decide(view.approval, true);
  assert.equal(runtime.getSnapshot().approval.status, "consumed");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "2");
  assert.equal(f.db.sql("select count(*) from public.nest_refund_receipts"), "1");
  stop();
});
