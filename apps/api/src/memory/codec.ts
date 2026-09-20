import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import { ApiFailure } from "../errors.ts";
export const decode = <A>(
  schema: Schema.Codec<A>,
  value: unknown,
  code: ApiFailure["code"] = "unavailable",
) =>
  Schema.decodeUnknownEffect(schema)(value, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new ApiFailure({ code })),
  );
export const completeRange = (range: string | undefined, count: number) =>
  range === (count === 0 ? "*/0" : `0-${count - 1}/${count}`);
