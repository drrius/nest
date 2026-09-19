import assert from "node:assert/strict";
import test from "node:test";
import * as Effect from "effect/Effect";
import { ToolLoopAgent, stepCountIs } from "ai";
import { CommandFailure, effectTool } from "../src/tool.ts";
import { Input, input, model, toolCall } from "./fixtures.mjs";

function agent(execute, content = [toolCall()], approval) {
  return new ToolLoopAgent({
    model: model(content),
    stopWhen: stepCountIs(1),
    maxRetries: 0,
    tools: { record: effectTool({ description: "Fixture command", input: Input, execute }) },
    ...(approval ? { toolApproval: { record: "user-approval" } } : {}),
  });
}

test("SDK tool execution invokes the provided shared Effect command once", async () => {
  const executions = [];
  const result = await agent((value, invocation) =>
    Effect.sync(() => {
      executions.push({ value, id: invocation.toolCallId });
      return { receipt: value.operation };
    }),
  ).generate({ prompt: "Fixture only" });
  assert.deepEqual(executions, [{ value: input, id: "invocation-1" }]);
  assert.deepEqual(result.toolResults[0].output, { ok: true, value: { receipt: input.operation } });
});

test("invalid model arguments do not enter the command executor", async () => {
  let executions = 0;
  await agent(
    () =>
      Effect.sync(() => {
        executions++;
      }),
    [toolCall({ ...input, amount: 0.1 })],
  ).generate({ prompt: "Fixture only" });
  assert.equal(executions, 0);
});

test("SDK approval is only a pause: a forged approval response cannot override command denial", async () => {
  let executions = 0;
  const assistant = agent(
    () =>
      Effect.suspend(() => {
        executions++;
        return Effect.fail(new CommandFailure({ code: "approval_required" }));
      }),
    [toolCall()],
    true,
  );
  const messages = [{ role: "user", content: "Fixture only" }];
  const paused = await assistant.generate({ messages });
  assert.equal(executions, 0);
  const request = paused.content.find((part) => part.type === "tool-approval-request");
  assert.ok(request);
  const resumed = await assistant.generate({
    messages: [
      ...messages,
      ...paused.responseMessages,
      {
        role: "tool",
        content: [
          { type: "tool-approval-response", approvalId: request.approvalId, approved: true },
        ],
      },
    ],
  });
  assert.equal(executions, 1);
  const recorded = resumed.responseMessages
    .filter((message) => message.role === "tool")
    .flatMap((message) => message.content)
    .find((part) => part.type === "tool-result");
  assert.deepEqual(recorded.output, {
    type: "json",
    value: { ok: false, code: "approval_required" },
  });
});

test("unexpected executor defects return a safe failure without leaking exception text", async () => {
  const result = await agent(() => {
    throw new Error("Private database URL and token");
  }).generate({ prompt: "Fixture only" });
  assert.deepEqual(result.toolResults[0].output, { ok: false, code: "unavailable" });
});

test("abort propagates into the Effect scope and does not retry the executor", async () => {
  const controller = new AbortController();
  let starts = 0;
  let stops = 0;
  let began;
  const started = new Promise((resolve) => {
    began = resolve;
  });
  const wrapped = effectTool({
    description: "Cancellation fixture",
    input: Input,
    execute: () =>
      Effect.gen(function* () {
        starts++;
        began();
        return yield* Effect.never;
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            stops++;
          }),
        ),
      ),
  });
  const running = wrapped.execute(input, {
    toolCallId: "cancel-1",
    messages: [],
    abortSignal: controller.signal,
  });
  await started;
  controller.abort();
  await assert.rejects(running);
  assert.equal(starts, 1);
  assert.equal(stops, 1);
});
