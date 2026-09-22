import { legacyAdoptionApprovalContext } from "./legacy-adoption-approval-context.ts";
import { legacyAdoptionApprovals } from "./legacy-adoption-approval.ts";
import * as Effect from "effect/Effect";
import { ApiFailure } from "../errors.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { commandBody } from "../request-body.ts";
export function legacyAdoptionApprovalRoute(
  request: Request,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  return Effect.gen(function* () {
    const url = new URL(request.url),
      params = url.searchParams;
    const commands = legacyAdoptionApprovals(config, caller);
    if (request.method === "GET") {
      if (params.size !== 1 || !params.has("approvalId"))
        return yield* new ApiFailure({ code: "invalid_request" });
      if (url.pathname.endsWith("/context"))
        return yield* legacyAdoptionApprovalContext(config, caller, {
          approvalId: params.get("approvalId"),
        });
      return yield* commands.read({ approvalId: params.get("approvalId") });
    }
    if (params.size) return yield* new ApiFailure({ code: "invalid_request" });
    return yield* commands.decide(yield* commandBody(request, 49152));
  });
}
