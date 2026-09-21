import { generateText, Output, type LanguageModel } from "ai";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { effectSchema } from "./schema.ts";
export class StructuredGenerationFailure extends Schema.TaggedError<StructuredGenerationFailure>()(
  "StructuredGenerationFailure",
  { reason: Schema.Literal("unavailable") },
) {}
// Server-only adapter. Raw provider errors can contain private prompt/response text.
export function structuredGeneration<
  S extends Schema.ConstraintCodec<unknown, unknown, never, never>,
>(options: { model: LanguageModel; schema: S; instructions: string; data: unknown }) {
  return Effect.tryPromise({
    try: async (signal) => {
      const prompt = JSON.stringify(options.data);
      if (new TextEncoder().encode(prompt).length > 131072) throw new Error("Input too large");
      const result = await generateText({
        model: options.model,
        output: Output.object({ schema: effectSchema(options.schema) }),
        system: options.instructions,
        prompt,
        maxRetries: 0,
        maxOutputTokens: 16384,
        timeout: 30000,
        abortSignal: signal,
      });
      if (result.finishReason !== "stop") throw new Error("Incomplete generation");
      return result.output;
    },
    catch: () => new StructuredGenerationFailure({ reason: "unavailable" }),
  });
}
