import { aiCommandFiles } from "../../../../tests/database/ai-command-files.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { DefaultChatTransport, simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { createHandler } from "../../../../apps/api/src/handler.ts";
import { householdTools } from "../../../../apps/api/src/assistant/tools.ts";
import { validateHistory } from "../../src/chat.ts";
import { postgrestFixture } from "../../../../tests/integration/postgrest-fixture.mjs";
import { lostResponseProxy } from "../../../../tests/integration/lost-response-proxy.mjs";
import { usage } from "../fixtures.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const files = [...aiCommandFiles, "tests/integration/grocery-postgrest.sql"];
const preferences = {
  dailySummaryEnabled: true,
  dailySummaryTime: "08:00",
  itemRemindersEnabled: false,
};
const input = { expectedRevision: "0", preferences };
const call = (toolName, input, toolCallId = "notification-save") => ({
  type: "tool-call",
  toolCallId,
  toolName,
  input: JSON.stringify(input),
});
function modelFor(steps) {
  let count = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const calls = steps[count++];
      const chunks = calls
        ? [
            ...calls,
            { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
          ]
        : [
            { type: "text-start", id: "answer" },
            { type: "text-delta", id: "answer", delta: "Done." },
            { type: "text-end", id: "answer" },
            { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
          ];
      return { stream: simulateReadableStream({ initialDelayInMs: 0, chunkDelayInMs: 0, chunks }) };
    },
  });
}
async function run(f, model, actor = id(1), overrides = {}) {
  const handler = createHandler(
    { url: f.url, publishableKey: "sb_publishable_fixture" },
    { model },
  );
  const command = {
    conversationId: id(700),
    operationId: id(701),
    expectedRevision: "0",
    text: "Save household notification preferences",
    ...overrides,
  };
  const headers = {
    authorization: `Bearer ${actor === id(1) ? f.bearer : f.partnerBearer}`,
    "content-type": "application/json",
    "x-nest-household": id(10),
  };
  const transport = new DefaultChatTransport({
    api: "http://localhost/v1/assistant/turn",
    fetch: () =>
      handler(
        new Request("http://localhost/v1/assistant/turn", {
          method: "POST",
          headers,
          body: JSON.stringify(command),
        }),
      ),
  });
  const stream = await transport.sendMessages({
    trigger: "submit-message",
    chatId: command.conversationId,
    messages: [],
  });
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const history = JSON.parse(
    f.db.sql(
      `select transcript from public.nest_ai_conversations where id='${command.conversationId}'`,
    ),
  );
  const request = new Request("http://localhost/v1/notification-preferences", { headers });
  const { tools } = householdTools(
    request,
    { url: f.url, publishableKey: "sb_publishable_fixture" },
    {
      householdId: id(10),
      turn: command,
    },
  );
  await validateHistory(history, tools);
  return { chunks, history };
}
test("SDK reads only owner notification preferences then saves requested preferences through the canonical journal", async (t) => {
  const f = await postgrestFixture(t, files),
    model = modelFor([
      [call("readNotificationPreferences", {}, "read")],
      [call("saveNotificationPreferences", input)],
    ]);
  const { history } = await run(f, model);
  const read = history[1].parts.find((part) => part.type === "tool-readNotificationPreferences");
  assert.deepEqual(read.output, { ok: true, value: null });
  const saved = history[1].parts.find((part) => part.type === "tool-saveNotificationPreferences");
  assert.equal(saved.output.ok, true);
  assert.equal(saved.output.value.actorId, id(1));
  assert.equal(saved.output.value.revision, "1");
  assert.deepEqual(saved.input, input);
  assert.equal(
    f.db.sql("select daily_summary_time from public.nest_notification_preferences"),
    "08:00",
  );
  assert.equal(f.db.sql("select count(*) from public.nest_notification_preference_receipts"), "1");
  assert.equal(model.doStreamCalls.length, 3);
});
test("lost notification-write HTTP acknowledgment stops queued mutations and reconstructs saved preference receipt", async (t) => {
  const f = await postgrestFixture(t, files);
  const proxy = await lostResponseProxy(t, f.url, "/rest/v1/rpc/nest_execute_ai_command");
  const model = modelFor([
    [
      call("saveNotificationPreferences", input),
      call(
        "addGrocery",
        { name: "Must not commit", quantity: null, unit: null, categoryId: null },
        "queued",
      ),
    ],
  ]);
  const { history } = await run({ ...f, url: proxy.url }, model);
  assert.equal(proxy.dropped(), 1);
  assert.equal(model.doStreamCalls.length, 1);
  assert.equal(f.db.sql("select count(*) from public.nest_notification_preference_receipts"), "1");
  assert.equal(
    f.db.sql("select count(*) from public.grocery_items where name='Must not commit'"),
    "0",
  );
  const saved = history[1].parts.find((part) => part.type === "tool-saveNotificationPreferences");
  assert.equal(saved.output.ok, true);
  assert.equal(saved.output.value.revision, "1");
});
test("stale preference revision is a canonical conflict that prevents another model step", async (t) => {
  const f = await postgrestFixture(t, files);
  f.db.sql(
    `insert into public.nest_notification_preferences(actor_id,household_id,revision,daily_summary_enabled,daily_summary_time,item_reminders_enabled) values('${id(1)}','${id(10)}',1,false,'19:30',false)`,
  );
  const model = modelFor([[call("saveNotificationPreferences", input)]]);
  const { history } = await run(f, model);
  assert.deepEqual(
    history[1].parts.find((part) => part.type === "tool-saveNotificationPreferences").output,
    { ok: false, code: "conflict" },
  );
  assert.equal(model.doStreamCalls.length, 1);
  assert.equal(
    f.db.sql("select daily_summary_time from public.nest_notification_preferences"),
    "19:30",
  );
});

test("partner reads no owner settings and every assistant read rechecks current membership", async (t) => {
  const f = await postgrestFixture(t, files);
  await run(f, modelFor([[call("saveNotificationPreferences", input)]]));
  const model = modelFor([[call("readNotificationPreferences", {}, "read")]]);
  const { history } = await run(f, model, id(2), { conversationId: id(710), operationId: id(711) });
  assert.deepEqual(
    history[1].parts.find((p) => p.type === "tool-readNotificationPreferences").output,
    { ok: true, value: null },
  );
  assert.ok(!JSON.stringify(model.doStreamCalls).includes("08:00"));
  const { tools } = householdTools(
    new Request("http://localhost/", { headers: { authorization: `Bearer ${f.partnerBearer}` } }),
    { url: f.url, publishableKey: "sb_publishable_fixture" },
    {
      householdId: id(10),
      turn: { conversationId: id(710), operationId: id(711), expectedRevision: "0", text: "Read" },
    },
  );
  f.db.sql(
    `delete from public.household_members where user_id='${id(2)}' and household_id='${id(10)}'`,
  );
  assert.deepEqual(
    await tools.readNotificationPreferences.execute({}, { toolCallId: "again", messages: [] }),
    { ok: false, code: "forbidden" },
  );
});

test("malformed notification opt-in cannot dispatch or allow a later queued mutation", async (t) => {
  const f = await postgrestFixture(t, files);
  const { history } = await run(
    f,
    modelFor([
      [
        call("saveNotificationPreferences", {
          ...input,
          preferences: { ...preferences, dailySummaryEnabled: "true" },
        }),
        call(
          "addGrocery",
          { name: "Must not commit", quantity: null, unit: null, categoryId: null },
          "queued",
        ),
      ],
    ]),
  );
  assert.equal(f.db.sql("select count(*) from public.nest_notification_preferences"), "0");
  assert.equal(
    f.db.sql("select count(*) from public.grocery_items where name='Must not commit'"),
    "0",
  );
  assert.ok(
    !history[1].parts.some((p) => p.type === "tool-saveNotificationPreferences" && p.output?.ok),
  );
});
