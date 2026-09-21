import * as Effect from "effect/Effect";
import { recurringReads } from "./recurring-read.ts";
import { recurringCommands } from "./recurring.ts";
import { commandBody } from "../request-body.ts";
import { ApiFailure } from "../errors.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
export function recurringRoute(request: Request, config: IdentityConfig, caller: AuthorizedCaller) {
  return Effect.gen(function* () {
    const url = new URL(request.url),
      params = url.searchParams;
    if (url.pathname.endsWith("/rules")) {
      if (params.size > 1 || [...params.keys()].some((key) => key !== "after"))
        return yield* new ApiFailure({ code: "invalid_request" });
      return yield* recurringReads(config, caller).list({ after: params.get("after") });
    }
    if (url.pathname.endsWith("/rule")) {
      if (params.size !== 1 || !params.has("ruleId"))
        return yield* new ApiFailure({ code: "invalid_request" });
      return yield* recurringReads(config, caller).detail({ ruleId: params.get("ruleId") });
    }
    if (params.size) return yield* new ApiFailure({ code: "invalid_request" });
    const input = yield* commandBody(request, 65536),
      commands = recurringCommands(config, caller);
    return yield* url.pathname.endsWith("/execute")
      ? commands.execute(input)
      : commands.save(input);
  });
}
