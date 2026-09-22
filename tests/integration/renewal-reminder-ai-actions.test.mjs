import test from "node:test";
import assert from "node:assert/strict";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { files, id, json } from "../database/ai-renewal-fixture.mjs";
import { householdTools } from "../../apps/api/src/assistant/tools.ts";
import { actionResult } from "../../apps/mobile/src/assistant/action-result.ts";
test("registered SDK reminder save retains exact retries and produces a truthful native card", async (t) => {
  const f = await postgrestFixture(t, [
    ...files,
    "supabase/migrations/20260922213246_native_renewal_reminder_storage.sql",
    "supabase/migrations/20260922220043_native_ai_renewal_reminders.sql",
    "tests/integration/food-postgrest.sql",
  ]);
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
  const renewal = created.value.renewal;
  const command = {
    renewalId: renewal.renewalId,
    expectedRenewalRevision: renewal.revision,
    expectedRevision: null,
    settings: {
      anchor: "cancellation",
      delivery: { enabled: true, recipientIds: [id(1), id(2)], localTime: "08:30", daysBefore: 7 },
    },
  };
  const invocation = { toolCallId: "reminder", messages: [] };
  const saved = await tools.saveRenewalReminder.execute(command, invocation);
  assert.equal(saved.ok, true);
  assert.deepEqual(await tools.saveRenewalReminder.execute(command, invocation), saved);
  const read = await tools.readRenewalReminder.execute(
    { renewalId: renewal.renewalId },
    { ...call, toolCallId: "read" },
  );
  assert.equal(read.ok, true);
  assert.deepEqual(read.value.reminder.settings, command.settings);
  const card = actionResult({
    type: "tool-saveRenewalReminder",
    state: "output-available",
    output: saved,
  });
  assert.equal(card.label, "Reminder settings saved");
  assert.equal(card.href, "/renewals");
  assert.equal(f.db.sql("select count(*) from public.nest_ai_commands"), "2");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
