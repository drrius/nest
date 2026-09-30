import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { assistantClient } from "../src/assistant/client.ts";
import { AssistantFailure } from "../src/assistant/request.ts";
import { ChoreFailure } from "../src/chores/client.ts";
import { conversationOwner } from "../src/assistant/owner.ts";
import { reconcileConversation } from "../src/assistant/reconcile.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = { actor: id(1), household: id(10) };
const credentials = Effect.succeed({ user: { id: id(1) }, access_token: "fixture" });
const client = (fetcher, session = credentials) =>
  assistantClient("https://fixture.invalid/", account, session, fetcher);
const json = (body) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

test("native assistant never sends credentials for another actor and distinguishes expired identity", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return json({});
  };
  for (const session of [
    Effect.succeed({ user: { id: id(2) }, access_token: "other" }),
    Effect.fail(new ChoreFailure({ code: "session" })),
  ])
    await assert.rejects(Effect.runPromise(client(fetcher, session).list()), { code: "session" });
  assert.equal(calls, 0);
});

test("history and page responses cannot substitute another conversation or account", async () => {
  const history = {
    version: 1,
    conversation: { conversationId: id(99), revision: "1", messages: [] },
  };
  await assert.rejects(Effect.runPromise(client(async () => json(history)).read(id(98))), {
    code: "unavailable",
  });
  const page = {
    version: 1,
    actorId: id(2),
    householdId: id(10),
    conversations: [],
    nextCursor: null,
  };
  await assert.rejects(Effect.runPromise(client(async () => json(page)).list()), {
    code: "unavailable",
  });
});

test("transport rejects regeneration, missing operation and message identity drift before network access", async () => {
  let calls = 0;
  const input = {
    conversationId: id(80),
    operationId: id(81),
    expectedRevision: "0",
    text: "Read chores",
  };
  const api = client(async () => {
    calls++;
    return json({});
  });
  const args = {
    chatId: id(80),
    messages: [{ id: id(81), role: "user", parts: [{ type: "text", text: "Read chores" }] }],
    trigger: "submit-message",
    messageId: undefined,
  };
  await assert.rejects(api.transport(() => null).sendMessages(args));
  await assert.rejects(
    api.transport(() => input).sendMessages({ ...args, trigger: "regenerate-message" }),
  );
  await assert.rejects(
    api
      .transport(() => input)
      .sendMessages({ ...args, messages: [{ ...args.messages[0], id: id(82) }] }),
  );
  assert.equal(calls, 0);
});

test("another device's active turn stays visible after a local stale attempt was not claimed", async () => {
  const current = { id: id(82), role: "user", parts: [{ type: "text", text: "Other device" }] };
  const receipt = {
    claimed: false,
    state: "running",
    assistantId: id(83),
    inputRevision: "1",
    finalRevision: null,
    deadline: "2026-09-20T03:00:00Z",
  };
  const api = {
    read: () => Effect.succeed({ revision: "1", messages: [current] }),
    turn: (_conversation, operation) =>
      operation === id(82)
        ? Effect.succeed(receipt)
        : Effect.fail(new AssistantFailure({ code: "missing" })),
  };
  const result = await Effect.runPromise(
    reconcileConversation(api, id(80), {
      conversationId: id(80),
      operationId: id(81),
      expectedRevision: "0",
      text: "Mine",
    }),
  );
  assert.equal(result.operation, id(82));
  assert.equal(result.turn.state, "running");
});

test("subscription cleanup releases private state and reacquires a fresh runtime on remount", async () => {
  const api = client(async () => json({ version: 1, conversation: null }));
  const owner = conversationOwner(api, id(80), () => id(81));
  assert.equal(owner.getSnapshot(), null);
  const release = owner.subscribe(() => {}),
    first = owner.getSnapshot();
  release();
  assert.equal(owner.getSnapshot(), null);
  const releaseAgain = owner.subscribe(() => {}),
    second = owner.getSnapshot();
  assert.notEqual(first, second);
  await second.load();
  releaseAgain();
  assert.deepEqual(first.chat.messages, []);
  assert.deepEqual(second.chat.messages, []);
});
