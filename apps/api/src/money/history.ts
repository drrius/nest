import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { MoneyHistory, MoneyHistoryQuery } from "@nest/contracts/money-history";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
export function readMoneyHistory(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(MoneyHistoryQuery)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const before = query.before?.toLowerCase() ?? null;
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_money_history", {
      p_household: caller.member.householdId,
      p_before: before,
    });
    const page = yield* Schema.decodeUnknownEffect(MoneyHistory)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (page.householdId !== caller.member.householdId || page.before !== before)
      return yield* new ApiFailure({ code: "unavailable" });
    return page;
  });
}
