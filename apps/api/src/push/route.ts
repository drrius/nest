import * as Effect from "effect/Effect";
import { pushDeviceService } from "./service.ts";
import { ApiFailure } from "../errors.ts";
import { commandBody } from "../request-body.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
export function pushDeviceRoute(
  request: Request,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  return Effect.gen(function* () {
    const url = new URL(request.url),
      service = pushDeviceService(config, caller);
    if (request.method === "GET") {
      const key = url.pathname.endsWith("/operation") ? "operationId" : "installationId";
      if (url.searchParams.size !== 1 || !url.searchParams.has(key))
        return yield* new ApiFailure({ code: "invalid_request" });
      return yield* key === "operationId"
        ? service.recover({ operationId: url.searchParams.get(key) })
        : service.read({ installationId: url.searchParams.get(key) });
    }
    if (url.searchParams.size) return yield* new ApiFailure({ code: "invalid_request" });
    return yield* service.save(yield* commandBody(request, 32768));
  });
}
