import * as Effect from "effect/Effect";
import { renewalService } from "./service.ts";
import { ApiFailure } from "../errors.ts";
import { commandBody } from "../request-body.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
export function renewalRoute(request: Request, config: IdentityConfig, caller: AuthorizedCaller) {
  return Effect.gen(function* () {
    const url = new URL(request.url),
      service = renewalService(config, caller),
      params = url.searchParams;
    if (request.method === "GET") return yield* readRenewal(service, url);
    if (params.size) return yield* new ApiFailure({ code: "invalid_request" });
    const input = yield* commandBody(request, 8192);
    if (url.pathname.endsWith("/cancel-operation")) return yield* service.recover(input, true);
    return yield* url.pathname.endsWith("/remove") ? service.remove(input) : service.save(input);
  });
}

function readRenewal(service: ReturnType<typeof renewalService>, url: URL) {
  return Effect.gen(function* () {
    const params = url.searchParams;
    const key = url.pathname.endsWith("/detail")
      ? "renewalId"
      : url.pathname.endsWith("/operation")
        ? "operationId"
        : "after";
    if (
      params.size > 1 ||
      (params.size === 1 && !params.has(key)) ||
      (key !== "after" && !params.has(key))
    )
      return yield* new ApiFailure({ code: "invalid_request" });
    if (key === "renewalId") return yield* service.read({ renewalId: params.get(key) });
    if (key === "operationId")
      return yield* service.recover({ operationId: params.get(key) }, false);
    return yield* service.list({ after: params.get(key) });
  });
}
