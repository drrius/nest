import assert from "node:assert/strict";
import { test } from "node:test";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { files, id } from "../database/ai-refund-fixture.mjs";
import { refund as payload } from "./refund-api-fixture.mjs";
import { expense } from "../database/money-expense-helpers.mjs";
import { householdTools } from "../../apps/api/src/assistant/tools.ts";
const options = (toolCallId) => ({ toolCallId, messages: [] });
test("SDK refund proposal recovers committed response loss without posting and stays private", async (t) => {
  const f = await postgrestFixture(t, [...files, "tests/integration/food-postgrest.sql"]);
  const source = JSON.parse(
    f.db.sql(
      `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}'; ${expense("ai-refund-seed", { amount: 1000, own: 400 })}`,
    ),
  ).financial_event_id;
  const proxy = await lostResponseProxy(t, f.url, "/rest/v1/rpc/nest_execute_ai_command");
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
  const connect = (token = f.bearer) =>
    householdTools(
      new Request("http://localhost/", { headers: { authorization: `Bearer ${token}` } }),
      { url: proxy.url, publishableKey: "sb_publishable_fixture" },
      { householdId: id(10), turn },
    ).tools;
  const tools = connect();
  assert.equal("decideRefund" in tools, false);
  assert.equal("executeRefund" in tools, false);
  assert.equal("saveRefund" in tools, false);
  assert.deepEqual(
    await tools.proposeRefund.execute(payload(source.toUpperCase()), options("refund")),
    {
      ok: false,
      code: "unavailable",
    },
  );
  assert.deepEqual(
    await tools.proposeRefund.execute(payload(source.toUpperCase()), options("another")),
    {
      ok: false,
      code: "unavailable",
    },
  );
  const result = await connect().proposeRefund.execute(
    payload(source.toUpperCase()),
    options("refund"),
  );
  assert.equal(result.ok, true);
  assert.equal(result.value.approval.status, "pending");
  assert.deepEqual(result.value.approval.refund, payload(source));
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_ai_commands"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(proxy.dropped(), 1);
  assert.deepEqual(
    await connect(f.partnerBearer).proposeRefund.execute(
      payload(source.toUpperCase()),
      options("refund"),
    ),
    { ok: false, code: "forbidden" },
  );
});
