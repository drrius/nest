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
const files = [
  "tests/database/ai-command-fixture.sql",
  "tests/integration/grocery-postgrest.sql",
  "supabase/migrations/20260919205503_native_chore_receipts.sql",
  "supabase/migrations/20260919214311_native_grocery_check_receipts.sql",
  "supabase/migrations/20260920002735_native_grocery_commands.sql",
  "supabase/migrations/20260919220034_native_private_conversations.sql",
  "supabase/migrations/20260920022841_native_ai_turn_ownership.sql",
  "supabase/migrations/20260920033321_native_ai_command_journal.sql",
  "supabase/migrations/20260920041525_native_food_preferences.sql",
  "supabase/migrations/20260920044816_native_ai_food_preferences.sql",
  "supabase/migrations/20260920050551_native_cooking_preferences.sql",
  "supabase/migrations/20260920053446_native_ai_cooking_preferences.sql",
  "supabase/migrations/20260919213407_native_action_approvals.sql",
  "supabase/migrations/20260920054303_native_private_memory.sql",
  "supabase/migrations/20260920055247_native_memory_confirmation.sql",
  "supabase/migrations/20260920062302_native_ai_private_memory.sql",
];
const preferences = {
  restrictions: ["Peanuts"],
  dislikes: ["Olives"],
  calorieGoal: 2200,
  portions: 1.5,
};
const input = { expectedRevision: "0", preferences };
const call = (toolName, input, toolCallId = "food-save") => ({
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
async function run(f, model, actor = id(1)) {
  const handler = createHandler(
    { url: f.url, publishableKey: "sb_publishable_fixture" },
    { model },
  );
  const command = {
    conversationId: id(700),
    operationId: id(701),
    expectedRevision: "0",
    text: "Save my food preferences",
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
    f.db.sql(`select transcript from public.nest_ai_conversations where id='${id(700)}'`),
  );
  return { chunks, history };
}
test("SDK reads only own food profile then saves requested preferences through the canonical journal", async (t) => {
  const f = await postgrestFixture(t, files),
    model = modelFor([
      [call("readFoodPreferences", {}, "read")],
      [call("saveFoodPreferences", input)],
    ]);
  const { history } = await run(f, model);
  const read = history[1].parts.find((part) => part.type === "tool-readFoodPreferences");
  assert.deepEqual(read.output, { ok: true, value: null });
  const saved = history[1].parts.find((part) => part.type === "tool-saveFoodPreferences");
  assert.equal(saved.output.ok, true);
  assert.equal(saved.output.value.actorId, id(1));
  assert.equal(saved.output.value.revision, "1");
  assert.deepEqual(saved.input, input);
  assert.equal(f.db.sql("select calorie_goal from public.nest_food_profiles"), "2200");
  assert.equal(f.db.sql("select count(*) from public.nest_food_profile_receipts"), "1");
  assert.equal(model.doStreamCalls.length, 3);
});
test("private food read tool cannot expose partner profile or calorie goal", async (t) => {
  const f = await postgrestFixture(t, files);
  f.db.sql(
    `insert into public.nest_food_profiles(actor_id,household_id,revision,restrictions,dislikes,calorie_goal,portions) values('${id(1)}','${id(10)}',1,array['Private restriction'],array[]::text[],2345,1)`,
  );
  const model = modelFor([[call("readFoodPreferences", {}, "read")]]);
  const { history } = await run(f, model, id(2));
  assert.deepEqual(
    history[1].parts.find((part) => part.type === "tool-readFoodPreferences").output,
    { ok: true, value: null },
  );
  assert.ok(!JSON.stringify(model.doStreamCalls).includes("Private restriction"));
  assert.ok(!JSON.stringify(history).includes("2345"));
});
test("lost food-write HTTP acknowledgment stops queued mutations and reconstructs saved preference receipt", async (t) => {
  const f = await postgrestFixture(t, files);
  const proxy = await lostResponseProxy(t, f.url, "/rest/v1/rpc/nest_execute_ai_command");
  const model = modelFor([
    [
      call("saveFoodPreferences", input),
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
  assert.equal(f.db.sql("select count(*) from public.nest_food_profile_receipts"), "1");
  assert.equal(
    f.db.sql("select count(*) from public.grocery_items where name='Must not commit'"),
    "0",
  );
  const saved = history[1].parts.find((part) => part.type === "tool-saveFoodPreferences");
  assert.equal(saved.output.ok, true);
  assert.equal(saved.output.value.revision, "1");
});
test("stale preference revision is a canonical conflict that prevents another model step", async (t) => {
  const f = await postgrestFixture(t, files);
  f.db.sql(
    `insert into public.nest_food_profiles(actor_id,household_id,revision,restrictions,dislikes,portions) values('${id(1)}','${id(10)}',1,array['Existing'],array[]::text[],1)`,
  );
  const model = modelFor([[call("saveFoodPreferences", input)]]);
  const { history } = await run(f, model);
  assert.deepEqual(
    history[1].parts.find((part) => part.type === "tool-saveFoodPreferences").output,
    { ok: false, code: "conflict" },
  );
  assert.equal(model.doStreamCalls.length, 1);
  assert.equal(f.db.sql("select restrictions[1] from public.nest_food_profiles"), "Existing");
});

test("Unicode RPC boundaries cannot persist an unreadable profile or unrecoverable SDK history", async (t) => {
  const f = await postgrestFixture(t, files);
  const rejected = await fetch(`${f.url}/rest/v1/rpc/nest_save_food_profile`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
    body: JSON.stringify({
      p_household: id(10),
      p_operation: id(800),
      p_expected: "0",
      p_restrictions: ["🥜".repeat(61)],
      p_dislikes: [],
      p_calorie_goal: null,
      p_portions: 1,
    }),
  });
  assert.equal(rejected.status, 400);
  assert.equal(f.db.sql("select count(*) from public.nest_food_profiles"), "0");
  const valid = { ...input, preferences: { ...preferences, restrictions: ["🥜".repeat(60)] } };
  const { history } = await run(f, modelFor([[call("saveFoodPreferences", valid)]]));
  const config = { url: f.url, publishableKey: "sb_publishable_fixture" };
  const request = new Request("http://localhost/v1/food-preferences", {
    headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) },
  });
  const { tools } = householdTools(request, config, {
    householdId: id(10),
    turn: { conversationId: id(700), operationId: id(701), expectedRevision: "0", text: "Save" },
  });
  await validateHistory(history, tools);
  const read = await createHandler(config)(request);
  assert.equal(read.status, 200);
  assert.deepEqual((await read.json()).profile.preferences, valid.preferences);
});
