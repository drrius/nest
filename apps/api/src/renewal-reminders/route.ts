import * as Effect from "effect/Effect";
import { renewalReminderService } from "./service.ts";
import { ApiFailure } from "../errors.ts";
import { commandBody } from "../request-body.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
export function renewalReminderRoute(
  request: Request,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  return Effect.gen(function* () {
    const url = new URL(request.url),
      service = renewalReminderService(config, caller);
    if (request.method === "GET") {
      const key = url.pathname.endsWith("/operation") ? "operationId" : "renewalId";
      if (url.searchParams.size !== 1 || !url.searchParams.has(key))
        return yield* new ApiFailure({ code: "invalid_request" });
      return yield* key === "operationId"
        ? service.recover({ operationId: url.searchParams.get(key) }, false)
        : service.read({ renewalId: url.searchParams.get(key) });
    }
    if (url.searchParams.size) return yield* new ApiFailure({ code: "invalid_request" });
    const input = yield* commandBody(request, 4096);
    return yield* url.pathname.endsWith("/cancel-operation")
      ? service.recover(input, true)
      : service.save(input);
  });
}
