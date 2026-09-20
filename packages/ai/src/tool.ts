import { tool } from "ai";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { effectSchema } from "./schema.ts";

export class CommandFailure extends Schema.TaggedError<CommandFailure>()("CommandFailure", {
  code: Schema.Literals([
    "approval_required",
    "native_required",
    "forbidden",
    "conflict",
    "unavailable",
  ]),
}) {}
export interface Invocation {
  readonly toolCallId: string;
  readonly signal?: AbortSignal;
}
export interface Command<A, B> {
  readonly description: string;
  readonly input: Schema.ConstraintCodec<A, unknown, never, never>;
  // The caller binds verified identity and persisted approval state in this executor.
  // SDK approval metadata alone must never authorize a sensitive command.
  readonly execute: (input: A, invocation: Invocation) => Effect.Effect<B, CommandFailure>;
}
export function effectTool<A, B>(command: Command<A, B>) {
  return tool({
    description: command.description,
    inputSchema: effectSchema(command.input),
    execute: (input, options) =>
      Effect.suspend(() =>
        command.execute(input, {
          toolCallId: options.toolCallId,
          signal: options.abortSignal,
        }),
      ).pipe(
        Effect.match({
          onSuccess: (value) => ({ ok: true as const, value }),
          onFailure: (error) => ({ ok: false as const, code: error.code }),
        }),
        Effect.catchDefect(() =>
          Effect.succeed({ ok: false as const, code: "unavailable" as const }),
        ),
        (effect) => Effect.runPromise(effect, { signal: options.abortSignal }),
      ),
  });
}
