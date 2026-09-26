import assert from "node:assert/strict";
import { test } from "node:test";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { files, id } from "../database/ai-correction-fixture.mjs";
import { expense } from "../database/money-expense-helpers.mjs";
import { refund } from "./refund-api-fixture.mjs";
import { correction } from "./correction-api-fixture.mjs";

test("stale financial AI proposals return durable conflicts without transport retry or approval", async (t) => {
  const f = await postgrestFixture(t, [...files, "tests/integration/food-postgrest.sql"]);
  const source = JSON.parse(
    f.db.sql(
      `set role authenticated; set request.jwt.claims='{"sub":"${id(1)}"}'; ${expense(
        "stale-ai-proposal",
        {
          amount: 1000,
          own: 400,
        },
      )}`,
    ),
  ).financial_event_id;
  const rpc = async (name, body) => {
    const response = await fetch(`${f.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const identity = { p_household: id(10), p_conversation: id(900) };
  await rpc("nest_begin_ai_turn", {
    ...identity,
    p_operation: id(901),
    p_expected: 0,
    p_message: { id: id(901), role: "user", parts: [{ type: "text", text: "Review" }] },
  });
  const before = f.db.sql(
    "select jsonb_agg(to_jsonb(e) order by id) from public.financial_events e",
  );
  for (const entry of [
    {
      tool: "proposeRefund",
      input: refund(source, {
        expectedRemaining: [
          { memberId: id(1), centimes: "300" },
          { memberId: id(2), centimes: "600" },
        ],
      }),
    },
    { tool: "proposeCorrection", input: correction(source, { expectedReversalId: id(999) }) },
  ]) {
    const body = {
      ...identity,
      p_turn: id(901),
      p_call: entry.tool,
      p_tool: entry.tool,
      p_input: entry.input,
    };
    assert.deepEqual(await rpc("nest_execute_ai_command", body), { ok: false, code: "conflict" });
    assert.deepEqual(await rpc("nest_execute_ai_command", body), { ok: false, code: "conflict" });
  }
  assert.equal(f.db.sql("select count(*) from public.nest_ai_commands"), "2");
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "0");
  assert.equal(
    f.db.sql("select jsonb_agg(to_jsonb(e) order by id) from public.financial_events e"),
    before,
  );
});
