import { refundApprovals } from "./refund-approval.ts";
import { readRefundSave, cancelRefundSave } from "./refund-save-read.ts";
import * as Effect from "effect/Effect";
import { ApiFailure } from "../errors.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { commandBody } from "../request-body.ts";
import { refundCommands } from "./refund.ts";
import { readRefundContext } from "./refund-context.ts";
export function refundRoute(request: Request, config: IdentityConfig, caller: AuthorizedCaller) {
  if (new URL(request.url).pathname.includes("/approval"))
    return refundApprovalRoute(request, config, caller);
  return Effect.gen(function* () {
    const url = new URL(request.url),
      params = url.searchParams;
    if (url.pathname === "/v1/money/refund/receipt") {
      if (params.size !== 1 || !params.has("operationId"))
        return yield* new ApiFailure({ code: "invalid_request" });
      return yield* readRefundSave(config, caller, { operationId: params.get("operationId") });
    }
    if (url.pathname === "/v1/money/refund/context") {
      if (params.size !== 1 || !params.has("sourceEventId"))
        return yield* new ApiFailure({ code: "invalid_request" });
      return yield* readRefundContext(config, caller, {
        sourceEventId: params.get("sourceEventId"),
      });
    }
    if (params.size) return yield* new ApiFailure({ code: "invalid_request" });
    const commands = refundCommands(config, caller),
      input = yield* commandBody(request, 65536);
    if (url.pathname.endsWith("/cancel")) return yield* cancelRefundSave(config, caller, input);
    return yield* url.pathname.endsWith("/execute")
      ? commands.execute(input)
      : commands.save(input);
  });
}

function refundApprovalRoute(request: Request, config: IdentityConfig, caller: AuthorizedCaller) {
  return Effect.gen(function* () {
    const url = new URL(request.url),
      params = url.searchParams;
    const commands = refundApprovals(config, caller);
    if (url.pathname === "/v1/money/refund/approval") {
      if (params.size !== 1 || !params.has("approvalId"))
        return yield* new ApiFailure({ code: "invalid_request" });
      return yield* commands.read({ approvalId: params.get("approvalId") });
    }
    if (params.size) return yield* new ApiFailure({ code: "invalid_request" });
    return yield* commands.decide(yield* commandBody(request, 65536));
  });
}
