import assert from "node:assert/strict";
import { test } from "node:test";
import { simulateReadableStream, tool, jsonSchema } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { assistantStream, validateHistory } from "../src/chat.ts";
import { usage } from "./fixtures.mjs";
const user = { id: "user", role: "user", parts: [{ type: "text", text: "Read chores" }] };
const tools = {
  listChores: tool({
    inputSchema: jsonSchema({ type: "object", properties: {} }),
    execute: async () => ({ ok: true, value: [] }),
  }),
};

test("stored system messages, file URLs and unknown tools cannot enter model context", async () => {
  for (const message of [
    { ...user, role: "system" },
    {
      ...user,
      parts: [{ type: "file", mediaType: "text/plain", url: "http://private.internal/data" }],
    },
    {
      id: "a",
      role: "assistant",
      parts: [{ type: "tool-transferMoney", toolCallId: "c", state: "input-available", input: {} }],
    },
  ])
    await assert.rejects(validateHistory([message], tools));
});

test("interrupted read calls are omitted from model context without inventing successful outputs", async () => {
  const pending = {
    id: "assistant",
    role: "assistant",
    parts: [
      { type: "text", text: "Checking" },
      { type: "tool-listChores", toolCallId: "read", state: "input-available", input: {} },
    ],
  };
  const messages = await validateHistory([user, pending], tools);
  assert.deepEqual(messages[1].parts, [{ type: "text", text: "Checking" }]);
  assert.equal(pending.parts.length, 2, "stored record remains unchanged");
});

test("agent stops after five read steps and records an interrupted rather than complete answer", async () => {
  let result;
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        initialDelayInMs: 0,
        chunkDelayInMs: 0,
        chunks: [
          { type: "tool-call", toolCallId: "read", toolName: "listChores", input: "{}" },
          { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
        ],
      }),
    }),
  });
  const response = await assistantStream({
    model,
    tools,
    messages: [user],
    assistantId: "assistant",
    signal: new AbortController().signal,
    finish: async (message, completed) => {
      result = { message, completed };
    },
  });
  await response.text();
  assert.equal(model.doStreamCalls.length, 5);
  assert.equal(result.completed, false);
  assert.equal(result.message.id, "assistant");
});

test("model failures are masked in logs and streams, not retried, and finalize as interrupted", async (t) => {
  let completed;
  const logs = [];
  for (const method of ["error", "warn", "log"])
    t.mock.method(console, method, (...args) => logs.push(args));
  const model = new MockLanguageModelV4({
    doStream: async () => {
      throw new Error("fixture provider secret");
    },
  });
  const response = await assistantStream({
    model,
    tools,
    messages: [user],
    assistantId: "assistant",
    signal: new AbortController().signal,
    finish: async (_message, value) => {
      completed = value;
    },
  });
  const text = await response.text();
  assert.ok(!text.includes("fixture provider secret"));
  assert.ok(text.includes("Could not finish"));
  assert.deepEqual(logs, [], "private provider errors must not reach server logs");
  assert.equal(completed, false);
  assert.equal(model.doStreamCalls.length, 1);
});

test("bounded context keeps the latest prompt without dropping durable history", async () => {
  const history = Array.from({ length: 40 }, (_, index) => ({
    ...user,
    id: String(index),
    parts: [{ type: "text", text: "x".repeat(20000) }],
  }));
  history.push(user);
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        initialDelayInMs: 0,
        chunkDelayInMs: 0,
        chunks: [{ type: "finish", finishReason: { unified: "stop", raw: undefined }, usage }],
      }),
    }),
  });
  const response = await assistantStream({
    model,
    tools,
    messages: history,
    assistantId: "assistant",
    signal: new AbortController().signal,
    finish: async () => {},
  });
  await response.text();
  const prompt = model.doStreamCalls[0].prompt;
  assert.ok(prompt.length < 20);
  assert.ok(JSON.stringify(prompt).includes("Read chores"));
  assert.equal(history.length, 41);
});

test("unreconciled write calls cannot be silently discarded from model history", async () => {
  for (const name of [
    "addGrocery",
    "saveFoodPreferences",
    "skipChore",
    "rescheduleChore",
    "requestChoreTransfer",
    "respondChoreTransfer",
  ]) {
    const writes = { [name]: tools.listChores };
    const part = { type: `tool-${name}`, toolCallId: "write", input: {} };
    for (const state of ["input-available", "output-error", "output-denied"]) {
      const message = {
        id: "assistant",
        role: "assistant",
        parts: [{ ...part, state, errorText: "Unknown" }],
      };
      await assert.rejects(validateHistory([user, message], writes));
    }
    const recovered = {
      id: "assistant",
      role: "assistant",
      parts: [
        { ...part, state: "output-available", output: { ok: true, value: "committed fixture" } },
      ],
    };
    assert.deepEqual(await validateHistory([user, recovered], writes), [user, recovered]);
  }
});
