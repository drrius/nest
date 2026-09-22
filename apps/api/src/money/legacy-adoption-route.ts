import * as Effect from "effect/Effect";
import { legacyAdoptionCommands } from "./legacy-adoption.ts";
import { legacyAdoptionRecovery } from "./legacy-adoption-recovery.ts";
import { legacyAdoptionContext } from "./legacy-adoption-context.ts";
import { commandBody } from "../request-body.ts";
import { ApiFailure } from "../errors.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
export function legacyAdoptionRoute(
  request: Request,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  return Effect.gen(function* () {
    const url = new URL(request.url);
    if (request.method === "GET") {
      const context = url.pathname.endsWith("/context"),
        key = context ? "ruleId" : "operationId";
      if (url.searchParams.size !== 1 || !url.searchParams.has(key))
        return yield* new ApiFailure({ code: "invalid_request" });
      return yield* context
        ? legacyAdoptionContext(config, caller, { ruleId: url.searchParams.get(key) })
        : legacyAdoptionRecovery(config, caller).read({ operationId: url.searchParams.get(key) });
    }
    if (url.searchParams.size) return yield* new ApiFailure({ code: "invalid_request" });
    const input = yield* commandBody(request, 49152);
    if (url.pathname.endsWith("/cancel-save"))
      return yield* legacyAdoptionRecovery(config, caller).cancel(input);
    const commands = legacyAdoptionCommands(config, caller);
    return yield* url.pathname.endsWith("/execute")
      ? commands.execute(input)
      : commands.save(input);
  });
}
