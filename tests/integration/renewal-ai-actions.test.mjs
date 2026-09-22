import test from "node:test";
import assert from "node:assert/strict";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { files, id, json } from "../database/ai-renewal-fixture.mjs";
import { householdTools } from "../../apps/api/src/assistant/tools.ts";
import { actionResult } from "../../apps/mobile/src/assistant/action-result.ts";
test("registered SDK renewal actions retain exact retries and produce truthful native cards", async (t) => {
  const f = await postgrestFixture(t, [...files, "tests/integration/food-postgrest.sql"]);
  const turn = {
    conversationId: id(900),
    operationId: id(901),
    expectedRevision: "0",
    text: "Add my internet renewal",
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
    { url: f.url, publishableKey: "sb_publishable_fixture" },
    { householdId: id(10), turn },
  ).tools;
  const input = {
    fields: {
      title: "Internet",
      renewalOn: "2028-03-01",
      noticeDays: 1,
      responsibleId: null,
      recurringRuleId: null,
    },
  };
  const call = { toolCallId: "create", messages: [] };
  const created = await tools.createRenewal.execute(input, call);
  assert.equal(created.ok, true);
  assert.deepEqual(await tools.createRenewal.execute(input, call), created);
  const card = actionResult({
    type: "tool-createRenewal",
    state: "output-available",
    output: created,
  });
  assert.equal(card.label, "Renewal saved");
  assert.equal(card.href, "/renewals");
  const renewal = created.value.renewal;
  const edited = await tools.editRenewal.execute(
    {
      renewalId: renewal.renewalId,
      expectedRevision: renewal.revision,
      fields: { ...input.fields, title: "Internet updated" },
    },
    { ...call, toolCallId: "edit" },
  );
  assert.equal(edited.ok, true);
  const removed = await tools.removeRenewal.execute(
    { renewalId: renewal.renewalId, expectedRevision: edited.value.renewal.revision },
    { ...call, toolCallId: "remove" },
  );
  assert.equal(removed.ok, true);
  assert.equal(
    actionResult({ type: "tool-removeRenewal", state: "output-available", output: removed }).label,
    "Renewal removed",
  );
  assert.equal(f.db.sql("select count(*) from public.nest_ai_commands"), "3");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
