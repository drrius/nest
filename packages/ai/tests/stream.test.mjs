import assert from "node:assert/strict";
import test from "node:test";
import {
  ToolLoopAgent,
  DefaultChatTransport,
  createAgentUIStreamResponse,
  simulateReadableStream,
  stepCountIs,
} from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { usage } from "./fixtures.mjs";

test("SDK agent SSE response is consumed by the SDK chat transport without a second stream parser", async () => {
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        initialDelayInMs: 0,
        chunkDelayInMs: 0,
        chunks: [
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", delta: "Fixture " },
          { type: "text-delta", id: "text-1", delta: "response" },
          { type: "text-end", id: "text-1" },
          { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
        ],
      }),
    }),
  });
  const agent = new ToolLoopAgent({ model, stopWhen: stepCountIs(1), maxRetries: 0 });
  const transport = new DefaultChatTransport({
    api: "https://fixture.invalid/chat",
    fetch: async (_url, init) =>
      createAgentUIStreamResponse({
        agent,
        uiMessages: JSON.parse(init.body).messages,
        abortSignal: init.signal,
      }),
  });
  const stream = await transport.sendMessages({
    trigger: "submit-message",
    chatId: "fixture-chat",
    messageId: undefined,
    abortSignal: undefined,
    messages: [{ id: "user-1", role: "user", parts: [{ type: "text", text: "Fixture only" }] }],
  });
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.equal(
    chunks
      .filter((chunk) => chunk.type === "text-delta")
      .map((chunk) => chunk.delta)
      .join(""),
    "Fixture response",
  );
  assert.ok(chunks.some((chunk) => chunk.type === "finish"));
  assert.equal(model.doStreamCalls.length, 1);
});
