import { MockLanguageModelV4 } from "ai/test";
import * as Schema from "effect/Schema";

export const Input = Schema.Struct({
  operation: Schema.String.check(Schema.isUUID()),
  amount: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThan(0),
    Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
  ),
});
export const input = { operation: "10000000-0000-4000-8000-000000000001", amount: 101 };
export const usage = { inputTokens: { total: 1 }, outputTokens: { total: 1 } };
export const result = (content) => ({
  content,
  finishReason: { unified: "stop", raw: undefined },
  usage,
  warnings: [],
});
export const toolCall = (value = input) => ({
  type: "tool-call",
  toolCallId: "invocation-1",
  toolName: "record",
  input: JSON.stringify(value),
});
export const model = (content) => new MockLanguageModelV4({ doGenerate: result(content) });
