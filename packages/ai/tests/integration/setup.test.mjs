import { aiCommandFiles } from "../../../../tests/database/ai-command-files.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { DefaultChatTransport, simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { createHandler } from "../../../../apps/api/src/handler.ts";
import { householdTools } from "../../../../apps/api/src/assistant/tools.ts";
import { validateHistory } from "../../src/chat.ts";
import { postgrestFixture } from "../../../../tests/integration/postgrest-fixture.mjs";
import { usage } from "../fixtures.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const files = [...aiCommandFiles, "tests/integration/grocery-postgrest.sql"];
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
    text: "Help me set up Nest",
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
test("assistant reads per-person setup without saving defaults or exposing preferences", async (t) => {
  const f = await postgrestFixture(t, files);
  f.db.sql(
    `insert into public.nest_food_profiles(actor_id,household_id,revision,restrictions,dislikes,calorie_goal,portions) values('${id(2)}','${id(10)}',1,array['Secret'],array[]::text[],2345,1)`,
  );
  const model = modelFor([
    [call("readSetupStatus", {}, "setup-read"), call("openSetup", {}, "setup-open")],
  ]);
  const { history } = await run(f, model);
  assert.deepEqual(history[1].parts.find((p) => p.type === "tool-readSetupStatus").output, {
    ok: true,
    value: {
      version: 1,
      actorId: id(1),
      householdId: id(10),
      foodConfigured: false,
      cookingConfigured: false,
      notificationsConfigured: false,
    },
  });
  assert.deepEqual(history[1].parts.find((p) => p.type === "tool-openSetup").output, {
    ok: true,
    value: { kind: "device_handoff", screen: "setup" },
  });
  assert.ok(!JSON.stringify(model.doStreamCalls).includes("Secret"));
  assert.ok(!JSON.stringify(model.doStreamCalls).includes("2345"));
  assert.equal(f.db.sql("select count(*) from public.nest_notification_preferences"), "0");
  assert.equal(f.db.sql("select count(*) from public.nest_cooking_preferences"), "0");
  assert.equal(f.db.sql("select count(*) from public.nest_ai_commands"), "0");
});
test("setup tools reauthorize each call and cannot hand off or read after membership revocation", async (t) => {
  const f = await postgrestFixture(t, files);
  const { tools } = householdTools(
    new Request("http://localhost/", { headers: { authorization: `Bearer ${f.bearer}` } }),
    { url: f.url, publishableKey: "sb_publishable_fixture" },
    {
      householdId: id(10),
      turn: { conversationId: id(700), operationId: id(701), expectedRevision: "0", text: "Setup" },
    },
  );
  assert.equal(
    (await tools.readSetupStatus.execute({}, { toolCallId: "before", messages: [] })).ok,
    true,
  );
  f.db.sql(
    `delete from public.household_members where household_id='${id(10)}' and user_id='${id(1)}'`,
  );
  for (const name of ["readSetupStatus", "openSetup"])
    assert.deepEqual(await tools[name].execute({}, { toolCallId: "after", messages: [] }), {
      ok: false,
      code: "forbidden",
    });
});
