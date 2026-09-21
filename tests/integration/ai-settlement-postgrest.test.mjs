import assert from "node:assert/strict";
import { test } from "node:test";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { files, id } from "../database/ai-settlement-fixture.mjs";
import { settlement as payload } from "./settlement-api-fixture.mjs";
import { expense } from "../database/money-expense-helpers.mjs";
import { householdTools } from "../../apps/api/src/assistant/tools.ts";
const options = (toolCallId) => ({ toolCallId, messages: [] });
test("SDK settlement proposal recovers committed response loss without posting and stays private", async (t) => {
  const f = await postgrestFixture(t, [...files, "tests/integration/food-postgrest.sql"]);
  f.db.sql(
    `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}'; ${expense("ai-settlement-seed", { amount: 1000, own: 0 })}`,
  );
  const proxy = await lostResponseProxy(t, f.url, "/rest/v1/rpc/nest_execute_ai_command");
  const turn = {
    conversationId: id(900),
    operationId: id(901),
    expectedRevision: "0",
    text: "Record this shared settlement",
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
  assert.equal("decideSettlement" in tools, false);
  assert.equal("executeSettlement" in tools, false);
  assert.equal("saveSettlement" in tools, false);
  assert.deepEqual(await tools.proposeSettlement.execute(payload(), options("settlement")), {
    ok: false,
    code: "unavailable",
  });
  assert.deepEqual(await tools.proposeSettlement.execute(payload(), options("another")), {
    ok: false,
    code: "unavailable",
  });
  const result = await connect().proposeSettlement.execute(payload(), options("settlement"));
  assert.equal(result.ok, true);
  assert.equal(result.value.approval.status, "pending");
  assert.deepEqual(result.value.approval.settlement, payload());
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_ai_commands"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(proxy.dropped(), 1);
  assert.deepEqual(
    await connect(f.partnerBearer).proposeSettlement.execute(payload(), options("settlement")),
    { ok: false, code: "forbidden" },
  );
});
