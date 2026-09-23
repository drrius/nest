import test from "node:test";
import assert from "node:assert/strict";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { files, id, json, recurringContext } from "../database/ai-recurring-reminder-fixture.mjs";
import { householdTools } from "../../apps/api/src/assistant/tools.ts";
import { actionResult } from "../../apps/mobile/src/assistant/action-result.ts";
test("registered recurring reminder tools share authorized native save and retain exact retries", async (t) => {
  const f = await postgrestFixture(t, [...files, "tests/integration/food-postgrest.sql"]);
  const { input } = recurringContext(f.db);
  const turn = {
    conversationId: id(900),
    operationId: id(901),
    expectedRevision: "0",
    text: "Remind both of us about this meal at 09:00",
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
  const call = { toolCallId: "reminder", messages: [] };
  const before = await tools.readRecurringReminder.execute(
    { ruleId: input.ruleId },
    { ...call, toolCallId: "read" },
  );
  assert.equal(before.ok, true);
  assert.equal(before.value.reminder, null);
  assert.equal(before.value.rule.revision, input.expectedRuleRevision);
  const saved = await tools.saveRecurringReminder.execute(input, call);
  assert.equal(saved.ok, true);
  assert.deepEqual(await tools.saveRecurringReminder.execute(input, call), saved);
  const read = await tools.readRecurringReminder.execute(
    { ruleId: input.ruleId },
    { ...call, toolCallId: "read-after" },
  );
  assert.equal(read.ok, true);
  assert.deepEqual(read.value.reminder.settings, input.settings);
  const card = actionResult({
    type: "tool-saveRecurringReminder",
    state: "output-available",
    output: saved,
  });
  assert.equal(card.label, "Recurring reminder settings saved");
  assert.deepEqual(card.href, {
    pathname: "/recurring-reminder",
    params: { ruleId: input.ruleId },
  });
  assert.equal(f.db.sql("select count(*) from public.nest_ai_commands"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "0");
});

test("registered reminder reads reject outsiders and injected authority without journal writes", async (t) => {
  const f = await postgrestFixture(t, [...files, "tests/integration/food-postgrest.sql"]);
  const { input } = recurringContext(f.db);
  const build = (bearer) =>
    householdTools(
      new Request("http://localhost/", { headers: { authorization: `Bearer ${bearer}` } }),
      { url: f.url, publishableKey: "sb_publishable_fixture" },
      {
        householdId: id(10),
        turn: {
          conversationId: id(900),
          operationId: id(901),
          expectedRevision: "0",
          text: "Read reminder",
        },
      },
    ).tools;
  const call = { toolCallId: "read", messages: [] };
  const outsider = await build(f.otherBearer).readRecurringReminder.execute(
    { ruleId: input.ruleId },
    call,
  );
  assert.deepEqual(outsider, { ok: false, code: "forbidden" });
  const injected = await build(f.bearer).readRecurringReminder.execute(
    { ruleId: input.ruleId, householdId: id(20) },
    call,
  );
  assert.equal(injected.ok, false);
  const partner = await build(f.partnerBearer).readRecurringReminder.execute(
    { ruleId: input.ruleId },
    call,
  );
  assert.equal(partner.ok, true);
  assert.equal(partner.value.householdId, id(10));
  assert.equal(f.db.sql("select count(*) from public.nest_ai_commands"), "0");
});
