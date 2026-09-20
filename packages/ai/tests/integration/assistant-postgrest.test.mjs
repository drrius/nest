import assert from "node:assert/strict";
import { test } from "node:test";
import { DefaultChatTransport, simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { createHandler } from "../../../../apps/api/src/handler.ts";
import { postgrestFixture } from "../../../../tests/integration/postgrest-fixture.mjs";
import { usage } from "../fixtures.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const files = [
  "tests/database/legacy-chore-fixture.sql",
  "tests/integration/chore-postgrest.sql",
  "supabase/migrations/20260919220034_native_private_conversations.sql",
  "supabase/migrations/20260920022841_native_ai_turn_ownership.sql",
];
function readModel(beforeStep = () => {}) {
  let count = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      beforeStep(count);
      return {
        stream: simulateReadableStream({
          initialDelayInMs: 0,
          chunkDelayInMs: 0,
          chunks:
            count++ === 0
              ? [
                  {
                    type: "tool-call",
                    toolCallId: "read-chores",
                    toolName: "listChores",
                    input: "{}",
                  },
                  {
                    type: "finish",
                    finishReason: { unified: "tool-calls", raw: undefined },
                    usage,
                  },
                ]
              : [
                  { type: "text-start", id: "text-1" },
                  {
                    type: "text-delta",
                    id: "text-1",
                    delta: "Your current household chores are listed above.",
                  },
                  { type: "text-end", id: "text-1" },
                  { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
                ],
        }),
      };
    },
  });
}

test("authenticated SDK stream reads real household chores, persists private history and never regenerates a replay", async (t) => {
  const f = await postgrestFixture(t, files);
  const model = readModel();
  const handler = createHandler(
    { url: f.url, publishableKey: "sb_publishable_fixture" },
    { model },
  );
  const input = {
    conversationId: id(700),
    operationId: id(701),
    expectedRevision: "0",
    text: "Read my chores",
  };
  const headers = {
    authorization: `Bearer ${f.bearer}`,
    "content-type": "application/json",
    "x-nest-household": id(10),
  };
  const request = () =>
    new Request("http://localhost/v1/assistant/turn", {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });
  const transport = new DefaultChatTransport({
    api: "http://localhost/v1/assistant/turn",
    fetch: () => handler(request()),
  });
  const chunks = [];
  const stream = await transport.sendMessages({
    trigger: "submit-message",
    chatId: input.conversationId,
    messageId: undefined,
    abortSignal: undefined,
    messages: [],
  });
  for await (const chunk of stream) chunks.push(chunk);
  const output = chunks.find((chunk) => chunk.type === "tool-output-available").output;
  assert.equal(output.ok, true);
  assert.ok(output.value.some((chore) => chore.title === "Water plants"));
  assert.ok(output.value.every((chore) => chore.title !== "Private other home"));
  assert.ok(chunks.some((chunk) => chunk.type === "text-delta"));
  const historyResponse = await handler(
    new Request(`http://localhost/v1/assistant/conversation?id=${input.conversationId}`, {
      headers,
    }),
  );
  const { conversation } = await historyResponse.json();
  assert.equal(conversation.revision, "2");
  assert.equal(conversation.messages.length, 2);
  assert.equal(conversation.messages[0].id, input.operationId);
  const retry = await handler(request());
  assert.equal(retry.status, 409);
  assert.equal((await retry.json()).turn.state, "completed");
  assert.equal(model.doStreamCalls.length, 2, "one two-step generation only");
  assert.equal(historyResponse.headers.get("cache-control"), "no-store");
  const turns = await handler(
    new Request(
      `http://localhost/v1/assistant/turn?conversationId=${input.conversationId}&operationId=${input.operationId}`,
      { headers },
    ),
  );
  assert.equal((await turns.json()).turn.state, "completed");
  const anonymous = await handler(
    new Request(`http://localhost/v1/assistant/conversation?id=${input.conversationId}`),
  );
  assert.equal(anonymous.status, 401);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await handler(request())).status, 403);
});

test("disconnect persists an interrupted turn and recovery never starts another model", async (t) => {
  const f = await postgrestFixture(t, files);
  const model = new MockLanguageModelV4({
    doStream: async ({ abortSignal }) => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "text-start", id: "text" });
          controller.enqueue({ type: "text-delta", id: "text", delta: "Partial reply" });
          if (abortSignal.aborted) controller.close();
          else abortSignal.addEventListener("abort", () => controller.close(), { once: true });
        },
      }),
    }),
  });
  const handler = createHandler(
    { url: f.url, publishableKey: "sb_publishable_fixture" },
    { model },
  );
  const input = {
    conversationId: id(710),
    operationId: id(711),
    expectedRevision: "0",
    text: "Read chores",
  };
  const headers = { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" };
  const abort = new AbortController();
  const response = await handler(
    new Request("http://localhost/v1/assistant/turn", {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      signal: abort.signal,
    }),
  );
  const reader = response.body.getReader();
  await reader.read();
  abort.abort();
  while (!(await reader.read()).done) {
    /* Drain SDK cleanup/finalization. */
  }
  const turn = await handler(
    new Request(
      `http://localhost/v1/assistant/turn?conversationId=${input.conversationId}&operationId=${input.operationId}`,
      { headers },
    ),
  );
  assert.equal((await turn.json()).turn.state, "interrupted");
  assert.equal(model.doStreamCalls.length, 1);
  const partnerHeaders = { ...headers, authorization: `Bearer ${f.partnerBearer}` };
  const privateHistory = await handler(
    new Request(`http://localhost/v1/assistant/conversation?id=${input.conversationId}`, {
      headers: partnerHeaders,
    }),
  );
  assert.equal((await privateHistory.json()).conversation, null);
  const privateTurn = await handler(
    new Request(
      `http://localhost/v1/assistant/turn?conversationId=${input.conversationId}&operationId=${input.operationId}`,
      { headers: partnerHeaders },
    ),
  );
  assert.equal(privateTurn.status, 410);
});

test("abandoned claim recovery is explicit, deadline-gated and does not invoke the model", async (t) => {
  const f = await postgrestFixture(t, files);
  const model = readModel();
  const handler = createHandler(
    { url: f.url, publishableKey: "sb_publishable_fixture" },
    { model },
  );
  const input = { conversationId: id(720), operationId: id(721) };
  f.db.sql(`set role authenticated; set request.jwt.claims='{"sub":"${id(1)}"}';
    select public.nest_begin_ai_turn('${id(10)}','${input.conversationId}','${input.operationId}',0,
      '{"id":"${input.operationId}","role":"user","parts":[{"type":"text","text":"Lost claim response"}]}'::jsonb);`);
  const headers = { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" };
  const recover = () =>
    handler(
      new Request("http://localhost/v1/assistant/interrupt", {
        method: "POST",
        headers,
        body: JSON.stringify(input),
      }),
    );
  assert.equal((await recover()).status, 409);
  f.db.sql(
    `update public.nest_ai_turns set deadline_at=clock_timestamp()-interval '1 second' where conversation_id='${input.conversationId}'`,
  );
  assert.equal((await (await recover()).json()).turn.state, "interrupted");
  assert.equal((await (await recover()).json()).turn.state, "interrupted");
  assert.equal(model.doStreamCalls.length, 0);
});

test("missing model configuration and invalid input never claim a generation", async (t) => {
  const f = await postgrestFixture(t, files);
  const config = { url: f.url, publishableKey: "sb_publishable_fixture" };
  const model = readModel(),
    handler = createHandler(config, { model });
  const input = {
    conversationId: id(730),
    operationId: id(731),
    expectedRevision: "0",
    text: "Read chores",
  };
  const headers = { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" };
  const request = (body) =>
    new Request("http://localhost/v1/assistant/turn", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  assert.equal((await createHandler(config)(request(input))).status, 503);
  for (const body of [
    { ...input, actorId: id(2) },
    { ...input, expectedRevision: 0 },
    { ...input, messages: [] },
    { ...input, text: " " },
    { ...input, text: "x".repeat(2001) },
  ])
    assert.equal((await handler(request(body))).status, 400);
  assert.equal(model.doStreamCalls.length, 0);
  assert.equal(f.db.sql("select count(*) from public.nest_ai_turns"), "0");
});

test("a membership move mid-turn cannot read another household even without a client scope header", async (t) => {
  const f = await postgrestFixture(t, files);
  const model = readModel((step) => {
    const household = step === 0 ? id(20) : id(10);
    f.db.sql(
      `update public.household_members set household_id='${household}' where user_id='${id(1)}'`,
    );
  });
  const handler = createHandler(
    { url: f.url, publishableKey: "sb_publishable_fixture" },
    { model },
  );
  const input = {
    conversationId: id(740),
    operationId: id(741),
    expectedRevision: "0",
    text: "Read chores",
  };
  const headers = { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" };
  const response = await handler(
    new Request("http://localhost/v1/assistant/turn", {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    }),
  );
  const stream = await response.text();
  assert.ok(stream.includes("forbidden"));
  assert.ok(!stream.includes("Private other home"));
  const prompt = JSON.stringify(model.doStreamCalls[1].prompt);
  assert.ok(prompt.includes("forbidden"));
  assert.ok(!prompt.includes("Private other home"));
  const saved = await handler(
    new Request(`http://localhost/v1/assistant/conversation?id=${input.conversationId}`, {
      headers,
    }),
  );
  const history = await saved.json();
  assert.equal(history.conversation.revision, "2");
  assert.ok(!JSON.stringify(history).includes("Private other home"));
});
