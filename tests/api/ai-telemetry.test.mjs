import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { assistantStream } from "../../packages/ai/src/chat.ts";
import { structuredGeneration } from "../../packages/ai/src/structured.ts";
import { aiTelemetry } from "../../apps/api/src/ai-telemetry.ts";
import { observeHandler } from "../../apps/api/src/telemetry.ts";

const require = createRequire(new URL("../../packages/ai/package.json", import.meta.url));
const { simulateReadableStream, tool, jsonSchema, registerTelemetry } = await import(
  require.resolve("ai")
);
const { MockLanguageModelV4 } = await import(require.resolve("ai/test"));
const Effect = await import(require.resolve("effect/Effect"));
const Schema = await import(require.resolve("effect/Schema"));
const usage = { inputTokens: { total: 1 }, outputTokens: { total: 1 } };
const user = {
  id: "private-user-id",
  role: "user",
  parts: [{ type: "text", text: "private prompt" }],
};
const response = (chunks) => ({
  stream: simulateReadableStream({ initialDelayInMs: 0, chunkDelayInMs: 0, chunks }),
});
const finish = (unified) => ({
  type: "finish",
  finishReason: { unified, raw: "private-finish" },
  usage,
});

test("actual assistant streams and tools produce correlated spans with no private payloads", async () => {
  const records = [];
  const capturedSettings = [];
  const model = new MockLanguageModelV4({
    doStream: [
      response([
        {
          type: "tool-call",
          toolCallId: "private-invocation",
          toolName: "listChores",
          input: '{"query":"private-input"}',
        },
        finish("tool-calls"),
      ]),
      response([
        { type: "text-start", id: "private-text-id" },
        { type: "text-delta", id: "private-text-id", delta: "private output" },
        { type: "text-end", id: "private-text-id" },
        finish("stop"),
      ]),
    ],
  });
  const tools = {
    listChores: tool({
      inputSchema: jsonSchema({ type: "object", properties: { query: { type: "string" } } }),
      execute: async () => ({ ok: true, value: "private tool output" }),
    }),
  };
  let saved;
  const handle = observeHandler(
    async (request) => {
      const telemetry = aiTelemetry("assistant", model, Object.keys(tools));
      const onStart = telemetry.onStart;
      telemetry.onStart = (event) => {
        capturedSettings.push([event.recordInputs, event.recordOutputs]);
        return onStart(event);
      };
      return assistantStream({
        model,
        tools,
        messages: [user],
        assistantId: "private-assistant-id",
        signal: request.signal,
        telemetry,
        finish: async (_message, completed) => {
          saved = completed;
        },
      });
    },
    {},
    (record) => records.push(record),
  );
  const result = await handle(new Request("https://fixture.example/v1/assistant/turn"));
  assert.match(await result.text(), /private output/);
  assert.equal(saved, true);
  assert.deepEqual(capturedSettings, [[false, false]]);
  assert.equal(model.doStreamCalls.length, 2);
  assert.equal(records.filter((row) => row.event === "nest.ai.model").length, 2);
  assert.equal(records.find((row) => row.event === "nest.ai.tool").tool, "listChores");
  assert.equal(records.find((row) => row.event === "nest.ai.generation").outcome, "complete");
  const request = records.find((row) => row.event === "nest.request");
  for (const record of records.filter((row) => row.event.startsWith("nest.ai."))) {
    assert.equal(record.trace_id, request.trace_id);
    assert.equal(record.parent_span_id, request.span_id);
    assert.ok(record.duration_ms >= 0);
    assert.equal(record.model, model.modelId);
  }
  assert.doesNotMatch(JSON.stringify(records), /private|prompt|input|output|invocation|1234567/);
});

test("structured generation emits model/operation spans and replaces global recording integrations", async () => {
  let globalRecords = 0;
  registerTelemetry({
    onStart: () => {
      globalRecords++;
    },
  });
  const records = [];
  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text: '{"description":"private-recipe","centimes":1234567}' }],
      finishReason: { unified: "stop", raw: "private-finish" },
      usage,
      warnings: [],
    },
  });
  const handle = observeHandler(
    async () => {
      const value = await Effect.runPromise(
        structuredGeneration({
          model,
          schema: Schema.Struct({ description: Schema.String, centimes: Schema.Int }),
          instructions: "private instructions",
          data: { preferences: "private food and calendar" },
          telemetry: aiTelemetry("meal-generation", model),
        }),
      );
      return Response.json(value);
    },
    {},
    (record) => records.push(record),
  );
  const result = await handle(new Request("https://fixture.example/v1/meals/proposal/generate"));
  assert.deepEqual(await result.json(), { description: "private-recipe", centimes: 1234567 });
  assert.equal(globalRecords, 0);
  assert.equal(
    records.find((row) => row.event === "nest.ai.generation").operation,
    "meal-generation",
  );
  assert.equal(records.find((row) => row.event === "nest.ai.model").outcome, "complete");
  assert.doesNotMatch(JSON.stringify(records), /private|1234567|preferences|centimes|calendar/);
  await Effect.runPromise(
    structuredGeneration({
      model,
      schema: Schema.Struct({ description: Schema.String, centimes: Schema.Int }),
      instructions: "private",
      data: "private",
    }),
  );
  assert.equal(globalRecords, 0, "uninstrumented calls also disable global input/output capture");
});

test("generation errors close model and generation spans without provider details or retries", async () => {
  const records = [];
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      throw new Error("private provider exception");
    },
  });
  const handle = observeHandler(
    async () => {
      await assert.rejects(
        Effect.runPromise(
          structuredGeneration({
            model,
            schema: Schema.Struct({ value: Schema.String }),
            instructions: "private",
            data: "private",
            telemetry: aiTelemetry("meal-constraint-check", model),
          }),
        ),
        { reason: "unavailable" },
      );
      return new Response(null, { status: 503 });
    },
    {},
    (record) => records.push(record),
  );
  await handle(new Request("https://fixture.example/v1/meals/proposal/generate"));
  assert.equal(model.doGenerateCalls.length, 1);
  for (const event of ["nest.ai.generation", "nest.ai.model"])
    assert.equal(records.find((row) => row.event === event).outcome, "failed");
  assert.doesNotMatch(JSON.stringify(records), /private|exception|instructions/);
});

test("AI cancellation closes active spans once without reading private callback payloads", async () => {
  const records = [];
  const model = new MockLanguageModelV4();
  const handle = observeHandler(
    async () => {
      const telemetry = aiTelemetry("assistant", model, ["listChores"]);
      telemetry.onStart({});
      telemetry.onLanguageModelCallStart({});
      telemetry.onToolExecutionStart({
        toolCall: { toolName: "private-unknown-tool", toolCallId: "private-invocation" },
      });
      telemetry.onAbort({ messages: "private-message", steps: "private-step" });
      telemetry.onError(new Error("private-error"));
      return new Response(null);
    },
    {},
    (record) => records.push(record),
  );
  await handle(new Request("https://fixture.example/v1/assistant/turn"));
  const spans = records.filter((row) => row.event.startsWith("nest.ai."));
  assert.equal(spans.length, 3);
  assert.ok(spans.every((row) => row.outcome === "cancelled"));
  assert.equal(spans.find((row) => row.event === "nest.ai.tool").tool, "unknown");
  assert.doesNotMatch(JSON.stringify(records), /private/);
});
