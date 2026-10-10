import type { AssistantModel, GenerationTelemetry } from "@nest/ai/chat";
import { diagnosticSpans } from "./telemetry.ts";

export function aiTelemetry(
  operation: "assistant" | "meal-generation" | "meal-constraint-check",
  model: AssistantModel,
  toolNames: readonly string[] = [],
): GenerationTelemetry {
  const start = diagnosticSpans();
  const modelName = typeof model === "string" ? model : model.modelId;
  const safeModel = /^[a-zA-Z0-9._:/-]{1,100}$/.test(modelName) ? modelName : "configured";
  const attributes = { operation, model: safeModel };
  type End = ReturnType<typeof start>;
  let generation: End | undefined;
  let languageModel: End | undefined;
  const tools = new Map<string, End>();
  const finish = (outcome: "complete" | "failed" | "cancelled") => {
    languageModel?.(outcome);
    generation?.(outcome);
    for (const tool of tools.values()) tool(outcome);
    tools.clear();
  };
  return {
    onStart: () => {
      generation = start("generation", attributes);
    },
    onLanguageModelCallStart: () => {
      languageModel = start("model", attributes);
    },
    onLanguageModelCallEnd: ({ finishReason }) => {
      languageModel?.(["stop", "tool-calls"].includes(finishReason) ? "complete" : "failed");
    },
    onToolExecutionStart: ({ toolCall }) => {
      const tool = toolNames.includes(toolCall.toolName) ? toolCall.toolName : "unknown";
      tools.set(toolCall.toolCallId, start("tool", { ...attributes, tool }));
    },
    onToolExecutionEnd: ({ toolCall, toolOutput }) => {
      const output = toolOutput.type === "tool-result" ? toolOutput.output : null;
      const failed =
        toolOutput.type === "tool-error" ||
        (typeof output === "object" && output !== null && "ok" in output && output.ok === false);
      tools.get(toolCall.toolCallId)?.(failed ? "failed" : "complete");
      tools.delete(toolCall.toolCallId);
    },
    onEnd: (event) =>
      finish("finishReason" in event && event.finishReason === "stop" ? "complete" : "failed"),
    onAbort: () => finish("cancelled"),
    onError: () => finish("failed"),
  };
}
