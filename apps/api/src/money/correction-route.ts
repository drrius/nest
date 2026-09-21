import { correctionApprovals } from "./correction-approval.ts";
import { readCorrectionSave, cancelCorrectionSave } from "./correction-save-read.ts";
import * as Effect from "effect/Effect";
import { ApiFailure } from "../errors.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { commandBody } from "../request-body.ts";
import { correctionCommands } from "./correction.ts";
import { readCorrectionContext } from "./correction-context.ts";
export function correctionRoute(
  request: Request,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  if (new URL(request.url).pathname.includes("/approval"))
    return correctionApprovalRoute(request, config, caller);
  return Effect.gen(function* () {
    const url = new URL(request.url),
      params = url.searchParams;
    if (url.pathname === "/v1/money/correction/receipt") {
      if (params.size !== 1 || !params.has("operationId"))
        return yield* new ApiFailure({ code: "invalid_request" });
      return yield* readCorrectionSave(config, caller, { operationId: params.get("operationId") });
    }
    if (url.pathname === "/v1/money/correction/context") {
      if (params.size !== 1 || !params.has("sourceEventId"))
        return yield* new ApiFailure({ code: "invalid_request" });
      return yield* readCorrectionContext(config, caller, {
        sourceEventId: params.get("sourceEventId"),
      });
    }
    if (params.size) return yield* new ApiFailure({ code: "invalid_request" });
    const commands = correctionCommands(config, caller),
      input = yield* commandBody(request, 65536);
    if (url.pathname.endsWith("/cancel")) return yield* cancelCorrectionSave(config, caller, input);
    return yield* url.pathname.endsWith("/execute")
      ? commands.execute(input)
      : commands.save(input);
  });
}

function correctionApprovalRoute(
  request: Request,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  return Effect.gen(function* () {
    const url = new URL(request.url),
      params = url.searchParams;
    const commands = correctionApprovals(config, caller);
    if (url.pathname === "/v1/money/correction/approval") {
      if (params.size !== 1 || !params.has("approvalId"))
        return yield* new ApiFailure({ code: "invalid_request" });
      return yield* commands.read({ approvalId: params.get("approvalId") });
    }
    if (params.size) return yield* new ApiFailure({ code: "invalid_request" });
    return yield* commands.decide(yield* commandBody(request, 65536));
  });
}
