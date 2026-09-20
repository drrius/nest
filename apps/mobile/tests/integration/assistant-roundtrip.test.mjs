import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { nodeServer } from "../../../api/node-server.mjs";
import { createHandler } from "../../../api/src/handler.ts";
import { postgrestFixture } from "../../../../tests/integration/postgrest-fixture.mjs";
import { assistantClient } from "../../src/assistant/client.ts";
import { ConversationRuntime } from "../../src/assistant/conversation.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const files = [
  "tests/database/legacy-chore-fixture.sql",
  "tests/integration/chore-postgrest.sql",
  "supabase/migrations/20260919220034_native_private_conversations.sql",
  "supabase/migrations/20260920022841_native_ai_turn_ownership.sql",
];
async function setup(t, transport = fetch, suppliedModel) {
  const f = await postgrestFixture(t, files);
  const model =
    suppliedModel ??
    new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          initialDelayInMs: 0,
          chunkDelayInMs: 0,
          chunks: [
            { type: "text-start", id: "text" },
            { type: "text-delta", id: "text", delta: "Saved private reply" },
            { type: "text-end", id: "text" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
              usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
            },
          ],
        }),
      }),
    });
  const server = nodeServer(
    createHandler({ url: f.url, publishableKey: "sb_publishable_fixture" }, { model }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = assistantClient(
    base,
    { actor: id(1), household: id(10) },
    Effect.succeed({ access_token: f.bearer, user: { id: id(1) } }),
    transport,
  );
  let next = 900;
  const runtime = new ConversationRuntime(client, id(800), () => id(next++));
  t.after(() => runtime.dispose());
  return { ...f, client, model, runtime, uuid: () => id(next++) };
}

test("native SDK Chat sends only a stable prompt command and reloads saved history after restart", async (t) => {
  const sent = [];
  const f = await setup(t, async (url, init) => {
    if (init.method === "POST") sent.push(JSON.parse(init.body));
    return fetch(url, init);
  });
  await f.runtime.load();
  await Promise.all([f.runtime.send("Read my chores"), f.runtime.send("duplicate tap")]);
  assert.equal(f.model.doStreamCalls.length, 1);
  assert.equal(sent.length, 1);
  assert.deepEqual(Object.keys(sent[0]).sort(), [
    "conversationId",
    "expectedRevision",
    "operationId",
    "text",
  ]);
  assert.equal(f.runtime.chat.messages.length, 2);
  assert.equal(f.runtime.getSnapshot().savedOperation, sent[0].operationId);
  assert.equal(f.runtime.getSnapshot().pending, null);
  const page = await Effect.runPromise(f.client.list());
  assert.equal(page.conversations[0].conversationId, id(800));
  f.runtime.dispose();
  const reopened = new ConversationRuntime(f.client, id(800), f.uuid);
  t.after(() => reopened.dispose());
  await reopened.load();
  assert.equal(
    reopened.chat.messages[1].parts.find((part) => part.type === "text").text,
    "Saved private reply",
  );
  await reopened.send("Next prompt");
  assert.equal(sent[1].expectedRevision, "2");
  assert.equal(reopened.chat.messages.length, 4);
});

test("pre-claim network failure retains exact operation for explicit retry only", async (t) => {
  let offline = true;
  const sent = [];
  const f = await setup(t, async (url, init) => {
    if (init.method === "POST") {
      sent.push(JSON.parse(init.body));
      if (offline) throw new TypeError("Fixture network offline");
    }
    return fetch(url, init);
  });
  await f.runtime.load();
  await f.runtime.send("Keep this prompt");
  assert.equal(f.model.doStreamCalls.length, 0);
  assert.equal(f.runtime.getSnapshot().retryable, true);
  await f.runtime.send("Cannot replace uncertain prompt");
  assert.equal(sent.length, 1);
  offline = false;
  await f.runtime.retry();
  assert.deepEqual(sent[1], sent[0]);
  assert.equal(f.model.doStreamCalls.length, 1);
  assert.equal(f.runtime.getSnapshot().retryable, false);
});

test("lost streamed acknowledgment reloads terminal receipt instead of regenerating", async (t) => {
  const f = await setup(t, async (url, init) => {
    const response = await fetch(url, init);
    if (init.method === "POST") {
      await response.text();
      throw new TypeError("Fixture lost response");
    }
    return response;
  });
  await f.runtime.load();
  await f.runtime.send("Read privately");
  assert.equal(f.runtime.getSnapshot().retryable, false);
  assert.equal(f.runtime.getSnapshot().loaded, true);
  assert.equal(f.runtime.chat.messages.length, 2);
  await f.runtime.retry();
  assert.equal(f.model.doStreamCalls.length, 1);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await f.runtime.load();
  assert.equal(f.runtime.getSnapshot().loaded, false);
  assert.deepEqual(f.runtime.chat.messages, []);
});

test("cold reopening an abandoned turn blocks sending until explicit deadline recovery", async (t) => {
  const f = await setup(t);
  const claimed = await fetch(`${f.url}/rest/v1/rpc/nest_begin_ai_turn`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
    body: JSON.stringify({
      p_household: id(10),
      p_conversation: id(800),
      p_operation: id(850),
      p_expected: "0",
      p_message: {
        id: id(850),
        role: "user",
        parts: [{ type: "text", text: "Interrupted device" }],
      },
    }),
  });
  assert.equal(claimed.status, 200);
  await f.runtime.load();
  assert.equal(f.runtime.getSnapshot().pending.state, "running");
  await f.runtime.send("Do not start again");
  assert.equal(f.model.doStreamCalls.length, 0);
  await f.runtime.recover();
  assert.equal(f.runtime.getSnapshot().loaded, false, "unexpired recovery cannot claim success");
  f.db.sql(
    `update public.nest_ai_turns set deadline_at=now()-interval '1 second' where conversation_id='${id(800)}'`,
  );
  await f.runtime.recover();
  assert.equal(f.runtime.getSnapshot().pending, null);
  assert.equal(f.runtime.getSnapshot().loaded, true);
  assert.ok(f.runtime.getSnapshot().notice.includes("interrupted"));
  assert.equal(f.model.doStreamCalls.length, 0);
  await f.runtime.send("A new prompt after recovery");
  assert.equal(f.model.doStreamCalls.length, 1);
});

test(
  "stopping a live native SDK stream aborts HTTP and preserves an interrupted server turn",
  { timeout: 10000 },
  async (t) => {
    const model = new MockLanguageModelV4({
      doStream: async ({ abortSignal }) => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "text-start", id: "partial" });
            controller.enqueue({
              type: "text-delta",
              id: "partial",
              delta: "Partial private reply",
            });
            if (abortSignal.aborted) controller.close();
            else abortSignal.addEventListener("abort", () => controller.close(), { once: true });
          },
        }),
      }),
    });
    const f = await setup(t, fetch, model);
    await f.runtime.load();
    const partial = new Promise((resolve) => {
      const unsubscribe = f.runtime.chat["~registerMessagesCallback"](() => {
        if (JSON.stringify(f.runtime.chat.messages).includes("Partial private reply")) {
          unsubscribe();
          resolve();
        }
      });
    });
    const sending = f.runtime.send("Start a response");
    await partial;
    await f.runtime.stop();
    await sending;
    // HTTP disconnect and database finalization race; reload observes the durable result.
    for (let n = 0; n < 20 && f.runtime.getSnapshot().pending; n++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await f.runtime.load();
    }
    assert.equal(f.runtime.getSnapshot().pending, null);
    assert.ok(f.runtime.getSnapshot().notice.includes("interrupted"));
    assert.equal(
      f.db.sql(`select state from public.nest_ai_turns where conversation_id='${id(800)}'`),
      "interrupted",
    );
    assert.equal(model.doStreamCalls.length, 1);
  },
);
