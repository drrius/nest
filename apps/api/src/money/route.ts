import { refundRoute } from "./refund-route.ts";
import { readSettlementSave, cancelSettlementSave } from "./settlement-save-read.ts";
import { settlementApprovals } from "./settlement-approval.ts";
import { settlementCommands } from "./settlement.ts";
import { readMoneyCategories } from "./categories.ts";
import { readExpenseSave, cancelExpenseSave } from "./expense-save-read.ts";
import { readMoneyCategory } from "./category.ts";
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
  if (url.pathname.startsWith("/v1/money/refund/")) return refundRoute(request, config, caller);
  if (url.pathname.startsWith("/v1/money/settlement/"))
    return settlementRoute(request, config, caller);
  if (url.pathname.startsWith("/v1/money/approval")) return approvalRoute(request, config, caller);
  if (url.pathname === "/v1/money/expense/receipt")
    return !singleParam(params, "operationId")
      ? Effect.fail(new ApiFailure({ code: "invalid_request" }))
      : readExpenseSave(config, caller, { operationId: params.get("operationId") });
  if (url.pathname.startsWith("/v1/money/expense/"))
    return Effect.gen(function* () {
      if (params.size) return yield* new ApiFailure({ code: "invalid_request" });
      const commands = expenseCommands(config, caller);
      const input = yield* commandBody(request, 65536);
      if (url.pathname.endsWith("/cancel")) return yield* cancelExpenseSave(config, caller, input);
      return yield* url.pathname.endsWith("/execute")
        ? commands.execute(input)
        : commands.save(input);
    });
  return readRoute(url, config, caller);
}
function readRoute(url: URL, config: IdentityConfig, caller: AuthorizedCaller) {
  const params = url.searchParams;
  if (url.pathname.startsWith("/v1/money/categor")) return categoryRoute(url, config, caller);
  if (url.pathname === "/v1/money/balance")
    return params.size
      ? Effect.fail(new ApiFailure({ code: "invalid_request" }))
      : readMoneyBalance(config, caller);
  if (url.pathname === "/v1/money/detail")
    return !singleParam(params, "eventId")
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

function singleParam(params: URLSearchParams, name: string) {
  return params.size === 1 && params.has(name);
}

function categoryRoute(url: URL, config: IdentityConfig, caller: AuthorizedCaller) {
  const params = url.searchParams;
  if (url.pathname === "/v1/money/categories")
    return params.size && !singleParam(params, "after")
      ? Effect.fail(new ApiFailure({ code: "invalid_request" }))
      : readMoneyCategories(config, caller, { after: params.get("after") });
  return !singleParam(params, "categoryId")
    ? Effect.fail(new ApiFailure({ code: "invalid_request" }))
    : readMoneyCategory(config, caller, { categoryId: params.get("categoryId") });
}

function settlementRoute(request: Request, config: IdentityConfig, caller: AuthorizedCaller) {
  const url = new URL(request.url);
  if (url.pathname === "/v1/money/settlement/receipt")
    return !singleParam(url.searchParams, "operationId")
      ? Effect.fail(new ApiFailure({ code: "invalid_request" }))
      : readSettlementSave(config, caller, { operationId: url.searchParams.get("operationId") });
  if (url.pathname.includes("/approval")) return settlementApprovalRoute(request, config, caller);
  return Effect.gen(function* () {
    const url = new URL(request.url);
    if (url.searchParams.size) return yield* new ApiFailure({ code: "invalid_request" });
    const input = yield* commandBody(request, 65536),
      commands = settlementCommands(config, caller);
    if (url.pathname.endsWith("/cancel")) return yield* cancelSettlementSave(config, caller, input);
    return yield* url.pathname.endsWith("/execute")
      ? commands.execute(input)
      : commands.save(input);
  });
}

function settlementApprovalRoute(
  request: Request,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  return Effect.gen(function* () {
    const url = new URL(request.url),
      commands = settlementApprovals(config, caller);
    if (url.pathname === "/v1/money/settlement/approval") {
      if (!singleParam(url.searchParams, "approvalId"))
        return yield* new ApiFailure({ code: "invalid_request" });
      return yield* commands.read({ approvalId: url.searchParams.get("approvalId") });
    }
    if (url.searchParams.size) return yield* new ApiFailure({ code: "invalid_request" });
    return yield* commands.decide(yield* commandBody(request, 65536));
  });
}
