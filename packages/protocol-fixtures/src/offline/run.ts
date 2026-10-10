import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { OfflineFailure } from "./contracts.ts";
export function run<A>(body: () => Promise<A>) {
  return Effect.tryPromise({
    try: body,
    catch: (cause) =>
      Schema.is(OfflineFailure)(cause) ? cause : new OfflineFailure({ reason: "storage" }),
  });
}
