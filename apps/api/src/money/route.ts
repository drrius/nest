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
