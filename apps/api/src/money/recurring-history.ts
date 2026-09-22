import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { RecurringHistory, RecurringHistoryQuery } from "@nest/contracts/recurring-history";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
export function recurringHistory(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(RecurringHistoryQuery)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const ruleId = query.ruleId.toLowerCase();
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_read_recurring_cycles", {
      p_household: caller.member.householdId,
      p_rule: ruleId,
      p_before: query.before,
    });
    const result = yield* Schema.decodeUnknownEffect(RecurringHistory)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      result.householdId !== caller.member.householdId ||
      result.ruleId !== ruleId ||
      result.before !== query.before
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}

export function recurringHistoryRoute(url: URL, config: IdentityConfig, caller: AuthorizedCaller) {
  const params = url.searchParams;
  if (
    !params.has("ruleId") ||
    params.size > 2 ||
    [...params.keys()].some((key) => !["ruleId", "before"].includes(key)) ||
    params.getAll("ruleId").length !== 1 ||
    params.getAll("before").length > 1
  )
    return Effect.fail(new ApiFailure({ code: "invalid_request" }));
  return recurringHistory(config, caller, {
    ruleId: params.get("ruleId"),
    before: params.get("before"),
  });
}
