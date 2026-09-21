import { recurringStateApprovalRoute } from "./recurring-state-approval-route.ts";
import * as Effect from "effect/Effect";
import { recurringStateCommands } from "./recurring-state.ts";
import { recurringStateRecovery } from "./recurring-state-read.ts";
import { commandBody } from "../request-body.ts";
import { ApiFailure } from "../errors.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
export function recurringStateRoute(
  request: Request,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  return Effect.gen(function* () {
    const url = new URL(request.url);
    if (url.pathname.includes("/approval"))
      return yield* recurringStateApprovalRoute(request, config, caller);
    if (request.method === "GET") {
      if (url.searchParams.size !== 1 || !url.searchParams.has("operationId"))
        return yield* new ApiFailure({ code: "invalid_request" });
      return yield* recurringStateRecovery(config, caller).read({
        operationId: url.searchParams.get("operationId"),
      });
    }
    if (url.searchParams.size) return yield* new ApiFailure({ code: "invalid_request" });
    const input = yield* commandBody(request, 2048);
    if (url.pathname.endsWith("/cancel-save"))
      return yield* recurringStateRecovery(config, caller).cancel(input);
    const commands = recurringStateCommands(config, caller);
    return yield* url.pathname.endsWith("/execute")
      ? commands.execute(input)
      : commands.save(input);
  });
}
