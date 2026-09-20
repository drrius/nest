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
];
const preferences = { cookingNotes: "Quick weekday meals", mealSlots: ["lunch", "dinner"] };
const input = { expectedRevision: "0", preferences };
const call = (toolName, input, toolCallId = "cooking-save") => ({
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
    text: "Save household cooking preferences",
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
  const request = new Request("http://localhost/v1/cooking-preferences", { headers });
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
test("SDK reads only shared cooking preferences then saves requested preferences through the canonical journal", async (t) => {
  const f = await postgrestFixture(t, files),
    model = modelFor([
      [call("readCookingPreferences", {}, "read")],
      [call("saveCookingPreferences", input)],
    ]);
  const { history } = await run(f, model);
  const read = history[1].parts.find((part) => part.type === "tool-readCookingPreferences");
  assert.deepEqual(read.output, { ok: true, value: null });
  const saved = history[1].parts.find((part) => part.type === "tool-saveCookingPreferences");
  assert.equal(saved.output.ok, true);
  assert.equal(saved.output.value.actorId, id(1));
  assert.equal(saved.output.value.revision, "1");
  assert.deepEqual(saved.input, input);
  assert.equal(
    f.db.sql("select cooking_notes from public.nest_cooking_preferences"),
    "Quick weekday meals",
  );
  assert.equal(f.db.sql("select count(*) from public.nest_cooking_preference_receipts"), "1");
  assert.equal(model.doStreamCalls.length, 3);
});
test("lost cooking-write HTTP acknowledgment stops queued mutations and reconstructs saved preference receipt", async (t) => {
  const f = await postgrestFixture(t, files);
  const proxy = await lostResponseProxy(t, f.url, "/rest/v1/rpc/nest_execute_ai_command");
  const model = modelFor([
    [
      call("saveCookingPreferences", input),
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
  assert.equal(f.db.sql("select count(*) from public.nest_cooking_preference_receipts"), "1");
  assert.equal(
    f.db.sql("select count(*) from public.grocery_items where name='Must not commit'"),
    "0",
  );
  const saved = history[1].parts.find((part) => part.type === "tool-saveCookingPreferences");
  assert.equal(saved.output.ok, true);
  assert.equal(saved.output.value.revision, "1");
});
test("stale preference revision is a canonical conflict that prevents another model step", async (t) => {
  const f = await postgrestFixture(t, files);
  f.db.sql(
    `insert into public.nest_cooking_preferences(household_id,revision,cooking_notes,meal_slots) values('${id(10)}',1,'Existing',array['dinner'])`,
  );
  const model = modelFor([[call("saveCookingPreferences", input)]]);
  const { history } = await run(f, model);
  assert.deepEqual(
    history[1].parts.find((part) => part.type === "tool-saveCookingPreferences").output,
    { ok: false, code: "conflict" },
  );
  assert.equal(model.doStreamCalls.length, 1);
  assert.equal(f.db.sql("select cooking_notes from public.nest_cooking_preferences"), "Existing");
});

test("both members read shared cooking choices without private profiles, and each read rechecks membership", async (t) => {
  const f = await postgrestFixture(t, files);
  f.db
    .sql(`insert into public.nest_cooking_preferences(household_id,revision,cooking_notes,meal_slots)
    values('${id(10)}',1,'Shared note',array['dinner']);
    insert into public.nest_food_profiles(actor_id,household_id,revision,restrictions,dislikes,calorie_goal,portions)
    values('${id(1)}','${id(10)}',1,array['Private restriction'],array[]::text[],2345,1)`);
  const model = modelFor([[call("readCookingPreferences", {}, "read")]]);
  const { history } = await run(f, model, id(2));
  assert.deepEqual(
    history[1].parts.find((part) => part.type === "tool-readCookingPreferences").output,
    {
      ok: true,
      value: { revision: "1", preferences: { cookingNotes: "Shared note", mealSlots: ["dinner"] } },
    },
  );
  assert.ok(!JSON.stringify(model.doStreamCalls).includes("Private restriction"));
  assert.ok(!JSON.stringify(history).includes("2345"));
  const { tools } = householdTools(
    new Request("http://localhost/", {
      headers: { authorization: `Bearer ${f.partnerBearer}` },
    }),
    { url: f.url, publishableKey: "sb_publishable_fixture" },
    {
      householdId: id(10),
      turn: { conversationId: id(700), operationId: id(701), expectedRevision: "0", text: "Read" },
    },
  );
  f.db.sql(
    `delete from public.household_members where user_id='${id(2)}' and household_id='${id(10)}'`,
  );
  assert.deepEqual(
    await tools.readCookingPreferences.execute({}, { toolCallId: "again", messages: [] }),
    { ok: false, code: "forbidden" },
  );
});

test("after a partner conflict a later explicit turn reads the current revision and preserves unchanged slots", async (t) => {
  const f = await postgrestFixture(t, files);
  f.db
    .sql(`insert into public.nest_cooking_preferences(household_id,revision,cooking_notes,meal_slots)
    values('${id(10)}',1,'Partner note',array['dinner'])`);
  await run(f, modelFor([[call("saveCookingPreferences", input)]]));
  const revision = f.db.sql(
    `select revision from public.nest_ai_conversations where id='${id(700)}'`,
  );
  const updated = {
    expectedRevision: "1",
    preferences: { cookingNotes: "New requested note", mealSlots: ["dinner"] },
  };
  const { history } = await run(
    f,
    modelFor([
      [call("readCookingPreferences", {}, "read-current")],
      [call("saveCookingPreferences", updated, "save-current")],
    ]),
    id(1),
    {
      operationId: id(702),
      expectedRevision: revision,
      text: "Use the current settings and change the note",
    },
  );
  assert.equal(
    history.at(-1).parts.find((part) => part.type === "tool-saveCookingPreferences").output.value
      .revision,
    "2",
  );
  assert.equal(
    f.db.sql("select cooking_notes from public.nest_cooking_preferences"),
    "New requested note",
  );
  assert.equal(f.db.sql("select meal_slots[1] from public.nest_cooking_preferences"), "dinner");
  assert.equal(f.db.sql("select count(*) from public.nest_cooking_preference_receipts"), "1");
});
