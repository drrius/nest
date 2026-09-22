import * as Effect from "effect/Effect";
import { legacyDismissalCommands } from "./legacy-dismissal.ts";
import { legacyDismissalRecovery } from "./legacy-dismissal-recovery.ts";
import { legacyDraftContext } from "./legacy-draft-context.ts";
import { commandBody } from "../request-body.ts";
import { ApiFailure } from "../errors.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
export function legacyDismissalRoute(
  request: Request,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  return Effect.gen(function* () {
    const url = new URL(request.url);
    if (request.method === "GET") {
      const context = url.pathname.endsWith("/context"),
        key = context ? "draftId" : "operationId";
      if (url.searchParams.size !== 1 || !url.searchParams.has(key))
        return yield* new ApiFailure({ code: "invalid_request" });
      return yield* context
        ? legacyDraftContext(config, caller, { draftId: url.searchParams.get(key) })
        : legacyDismissalRecovery(config, caller).read({ operationId: url.searchParams.get(key) });
    }
    if (url.searchParams.size) return yield* new ApiFailure({ code: "invalid_request" });
    const input = yield* commandBody(request, 2048);
    if (url.pathname.endsWith("/cancel-save"))
      return yield* legacyDismissalRecovery(config, caller).cancel(input);
    const commands = legacyDismissalCommands(config, caller);
    return yield* url.pathname.endsWith("/execute")
      ? commands.execute(input)
      : commands.save(input);
  });
}
