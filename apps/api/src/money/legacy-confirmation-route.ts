import { legacyConfirmationApprovalRoute } from "./legacy-confirmation-approval-route.ts";
import * as Effect from "effect/Effect";
import { legacyConfirmationCommands } from "./legacy-confirmation.ts";
import { legacyConfirmationRecovery } from "./legacy-confirmation-recovery.ts";
import { commandBody } from "../request-body.ts";
import { ApiFailure } from "../errors.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
export function legacyConfirmationRoute(
  request: Request,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  if (new URL(request.url).pathname.includes("/approval"))
    return legacyConfirmationApprovalRoute(request, config, caller);
  return Effect.gen(function* () {
    const url = new URL(request.url);
    if (request.method === "GET") {
      if (url.searchParams.size !== 1 || !url.searchParams.has("operationId"))
        return yield* new ApiFailure({ code: "invalid_request" });
      return yield* legacyConfirmationRecovery(config, caller).read({
        operationId: url.searchParams.get("operationId"),
      });
    }
    if (url.searchParams.size) return yield* new ApiFailure({ code: "invalid_request" });
    const input = yield* commandBody(request, 49152);
    if (url.pathname.endsWith("/cancel-save"))
      return yield* legacyConfirmationRecovery(config, caller).cancel(input);
    const commands = legacyConfirmationCommands(config, caller);
    return yield* url.pathname.endsWith("/execute")
      ? commands.execute(input)
      : commands.save(input);
  });
}
