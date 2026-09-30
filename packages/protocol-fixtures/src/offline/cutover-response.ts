import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";

export const isCutoverResponse = Schema.is(
  Schema.Struct({ error: Schema.Struct({ code: Schema.Literal("cutover") }) }),
);

export function isCutoverFailure<E>(response: { status: number; json: Effect.Effect<unknown, E> }) {
  return response.status === 409
    ? response.json.pipe(
        Effect.map(isCutoverResponse),
        Effect.orElseSucceed(() => false),
      )
    : Effect.succeed(false);
}
