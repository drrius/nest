import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id } from "./recurring-reminder-fixture.mjs";
import { householdTools } from "../../apps/api/src/assistant/tools.ts";
test("registered recurring reminder reads enforce current membership and reject injected authority", async (t) => {
  const f = await fixture(t);
  const build = (bearer) =>
    householdTools(
      new Request("http://localhost/", { headers: { authorization: `Bearer ${bearer}` } }),
      f.config,
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
  const tool = build(f.bearer).readRecurringReminder;
  const read = await tool.execute({ ruleId: f.ruleId }, call);
  assert.equal(read.ok, true);
  assert.equal(read.value.rule.ruleId, f.ruleId);
  assert.equal(read.value.rule.revision, f.command.expectedRuleRevision);
  assert.equal(read.value.reminder, null);
  assert.deepEqual(
    await build(f.otherBearer).readRecurringReminder.execute({ ruleId: f.ruleId }, call),
    { ok: false, code: "forbidden" },
  );
  assert.equal((await tool.execute({ ruleId: f.ruleId, householdId: id(20) }, call)).ok, false);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.deepEqual(await tool.execute({ ruleId: f.ruleId }, call), {
    ok: false,
    code: "forbidden",
  });
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_reminders"), "0");
});
