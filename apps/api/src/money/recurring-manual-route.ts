import * as Effect from "effect/Effect";
import { manualCycleCommands } from "./recurring-manual.ts";
import { manualCycleRecovery } from "./recurring-manual-read.ts";
import { commandBody } from "../request-body.ts";
import { ApiFailure } from "../errors.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
export function manualCycleRoute(
  request: Request,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  return Effect.gen(function* () {
    const url = new URL(request.url);
    if (request.method === "GET") {
      if (url.searchParams.size !== 1 || !url.searchParams.has("operationId"))
        return yield* new ApiFailure({ code: "invalid_request" });
      return yield* manualCycleRecovery(config, caller).read({
        operationId: url.searchParams.get("operationId"),
      });
    }
    if (url.searchParams.size) return yield* new ApiFailure({ code: "invalid_request" });
    const input = yield* commandBody(request, 2048);
    if (url.pathname.endsWith("/cancel-save"))
      return yield* manualCycleRecovery(config, caller).cancel(input);
    const commands = manualCycleCommands(config, caller);
    return yield* url.pathname.endsWith("/execute")
      ? commands.execute(input)
      : commands.save(input);
  });
}
