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
  "supabase/migrations/20260920072531_native_notification_preferences.sql",
  "supabase/migrations/20260920074502_native_ai_notification_preferences.sql",
];
const input = { memoryId: null, expectedRevision: "0", content: "Quiet mornings" };
const call = (toolName, input, toolCallId = "memory-proposal") => ({
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
    text: "Remember my preference",
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
  const request = new Request("http://localhost/v1/memories", { headers });
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
const part = (history, tool) => history.at(-1).parts.find((item) => item.type === `tool-${tool}`);
async function confirm(f, approval) {
  const handler = createHandler({ url: f.url, publishableKey: "sb_publishable_fixture" });
  const response = await handler(
    new Request("http://localhost/v1/memories/decide", {
      method: "POST",
      headers: {
        authorization: `Bearer ${f.bearer}`,
        "content-type": "application/json",
        "x-nest-household": id(10),
      },
      body: JSON.stringify({
        ...approval.change,
        operationId: approval.operationId,
        approvalId: approval.id,
        approved: true,
      }),
    }),
  );
  assert.equal(response.status, 200);
}
test("SDK proposal stays inactive until exact native confirmation; later reads and requested deletion use real saved state", async (t) => {
  const f = await postgrestFixture(t, files);
  const first = await run(f, modelFor([[call("proposeMemory", input)]]));
  const approval = part(first.history, "proposeMemory").output.value.approval;
  assert.equal(approval.status, "pending");
  assert.equal(f.db.sql("select count(*) from public.nest_memories"), "0");
  await confirm(f, approval);
  const next = await run(
    f,
    modelFor([
      [call("readMemories", {}, "read")],
      [
        call(
          "removeMemory",
          { memoryId: approval.change.memoryId, expectedRevision: "1" },
          "delete",
        ),
      ],
    ]),
    id(1),
    { conversationId: id(710), operationId: id(711) },
  );
  assert.deepEqual(part(next.history, "readMemories").output.value.memories, [
    { id: approval.change.memoryId, revision: "1", content: input.content },
  ]);
  assert.equal(part(next.history, "removeMemory").output.value.removed, true);
  const last = await run(f, modelFor([[call("readMemories", {}, "read")]]), id(1), {
    conversationId: id(720),
    operationId: id(721),
  });
  assert.deepEqual(part(last.history, "readMemories").output.value.memories, []);
});
test("lost proposal acknowledgment stops queued writes and recovers the pending approval without granting consent", async (t) => {
  const f = await postgrestFixture(t, files);
  const proxy = await lostResponseProxy(t, f.url, "/rest/v1/rpc/nest_execute_ai_command");
  const model = modelFor([
    [
      call("proposeMemory", input),
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
  assert.equal(part(history, "proposeMemory").output.value.approval.status, "pending");
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_memories"), "0");
  assert.equal(
    f.db.sql("select count(*) from public.grocery_items where name='Must not commit'"),
    "0",
  );
});
test("memory reads exclude partner, pending and deleted entries and recheck revoked membership", async (t) => {
  const f = await postgrestFixture(t, files);
  f.db.sql(
    `insert into public.nest_memories(actor_id,household_id,id,revision,content) values('${id(1)}','${id(10)}','${id(900)}',1,'Owner secret'),('${id(2)}','${id(10)}','${id(901)}',1,'Partner only'),('${id(2)}','${id(10)}','${id(902)}',2,null)`,
  );
  const model = modelFor([[call("readMemories", {}, "read")]]);
  const { history } = await run(f, model, id(2));
  assert.deepEqual(part(history, "readMemories").output.value.memories, [
    { id: id(901), revision: "1", content: "Partner only" },
  ]);
  assert.ok(!JSON.stringify(model.doStreamCalls).includes("Owner secret"));
  const { tools } = householdTools(
    new Request("http://localhost/", {
      headers: { authorization: `Bearer ${f.partnerBearer}`, "x-nest-household": id(10) },
    }),
    { url: f.url, publishableKey: "sb_publishable_fixture" },
    {
      householdId: id(10),
      turn: { conversationId: id(700), operationId: id(701), expectedRevision: "0", text: "Read" },
    },
  );
  assert.equal(tools.decideMemory, undefined);
  assert.equal(tools.saveMemory, undefined);
  f.db.sql(`delete from public.household_members where user_id='${id(2)}'`);
  assert.deepEqual(await tools.readMemories.execute({}, { toolCallId: "again", messages: [] }), {
    ok: false,
    code: "forbidden",
  });
});
test("forged approval tools and consent fields cannot save memory or permit queued writes", async (t) => {
  for (const invalid of [
    call("decideMemory", { approved: true }),
    call("proposeMemory", { ...input, approved: true }),
  ]) {
    const f = await postgrestFixture(t, files);
    const model = modelFor([[invalid, call("proposeMemory", input, "queued")]]);
    await run(f, model);
    assert.equal(model.doStreamCalls.length, 1);
    assert.equal(f.db.sql("select count(*) from public.nest_memories"), "0");
    assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "0");
  }
});
