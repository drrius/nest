import { expenseApprovals } from "./expense-approval.ts";
import { expenseCommands } from "./expense.ts";
import { commandBody } from "../request-body.ts";
import { readMoneyDetail } from "./detail.ts";
import * as Effect from "effect/Effect";
import { ApiFailure } from "../errors.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { readMoneyBalance } from "./read.ts";
import { readMoneyHistory } from "./history.ts";
export function moneyRoute(request: Request, config: IdentityConfig, caller: AuthorizedCaller) {
  const url = new URL(request.url),
    params = url.searchParams;
  if (url.pathname.startsWith("/v1/money/approval")) return approvalRoute(request, config, caller);
  if (url.pathname.startsWith("/v1/money/expense/"))
    return Effect.gen(function* () {
      if (params.size) return yield* new ApiFailure({ code: "invalid_request" });
      const commands = expenseCommands(config, caller);
      const input = yield* commandBody(request, 65536);
      return yield* url.pathname.endsWith("/execute")
        ? commands.execute(input)
        : commands.save(input);
    });
  if (url.pathname === "/v1/money/balance")
    return params.size
      ? Effect.fail(new ApiFailure({ code: "invalid_request" }))
      : readMoneyBalance(config, caller);
  if (url.pathname === "/v1/money/detail")
    return params.size !== 1 || !params.has("eventId")
      ? Effect.fail(new ApiFailure({ code: "invalid_request" }))
      : readMoneyDetail(config, caller, { eventId: params.get("eventId") });
  if (params.size > 1 || [...params.keys()].some((key) => key !== "before"))
    return Effect.fail(new ApiFailure({ code: "invalid_request" }));
  return readMoneyHistory(config, caller, { before: params.get("before") });
}

function approvalRoute(request: Request, config: IdentityConfig, caller: AuthorizedCaller) {
  return Effect.gen(function* () {
    const url = new URL(request.url),
      commands = expenseApprovals(config, caller);
    if (url.pathname === "/v1/money/approval") {
      if (url.searchParams.size !== 1 || !url.searchParams.has("approvalId"))
        return yield* new ApiFailure({ code: "invalid_request" });
      return yield* commands.read({ approvalId: url.searchParams.get("approvalId") });
    }
    if (url.searchParams.size) return yield* new ApiFailure({ code: "invalid_request" });
    return yield* commands.decide(yield* commandBody(request, 65536));
  });
}
