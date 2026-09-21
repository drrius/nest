import * as Effect from "effect/Effect";
import { recurringSaveRecovery } from "./recurring-save-read.ts";
import { recurringReads } from "./recurring-read.ts";
import { recurringCommands } from "./recurring.ts";
import { commandBody } from "../request-body.ts";
import { ApiFailure } from "../errors.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
export function recurringRoute(request: Request, config: IdentityConfig, caller: AuthorizedCaller) {
  const url = new URL(request.url);
  if (request.method === "GET") return recurringReadRoute(url, config, caller);
  return Effect.gen(function* () {
    if (url.searchParams.size) return yield* new ApiFailure({ code: "invalid_request" });
    if (url.pathname.endsWith("/cancel-save"))
      return yield* recurringSaveRecovery(config, caller).cancel(yield* commandBody(request, 1024));
    const input = yield* commandBody(request, 65536),
      commands = recurringCommands(config, caller);
    return yield* url.pathname.endsWith("/execute")
      ? commands.execute(input)
      : commands.save(input);
  });
}

function recurringReadRoute(url: URL, config: IdentityConfig, caller: AuthorizedCaller) {
  return Effect.gen(function* () {
    const params = url.searchParams;
    if (url.pathname.endsWith("/receipt")) {
      if (params.size !== 1 || !params.has("operationId"))
        return yield* new ApiFailure({ code: "invalid_request" });
      return yield* recurringSaveRecovery(config, caller).read({
        operationId: params.get("operationId"),
      });
    }
    if (url.pathname.endsWith("/rules")) {
      if (params.size > 1 || [...params.keys()].some((key) => key !== "after"))
        return yield* new ApiFailure({ code: "invalid_request" });
      return yield* recurringReads(config, caller).list({ after: params.get("after") });
    }
    if (params.size !== 1 || !params.has("ruleId"))
      return yield* new ApiFailure({ code: "invalid_request" });
    return yield* recurringReads(config, caller).detail({ ruleId: params.get("ruleId") });
  });
}
