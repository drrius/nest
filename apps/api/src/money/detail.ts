import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { MoneyDetail, MoneyDetailQuery } from "@nest/contracts/money-detail";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
export function readMoneyDetail(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(MoneyDetailQuery)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const eventId = query.eventId.toLowerCase();
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_money_detail", {
      p_household: caller.member.householdId,
      p_event: eventId,
    });
    const result = yield* Schema.decodeUnknownEffect(MoneyDetail)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      result.householdId !== caller.member.householdId ||
      result.event.eventId !== eventId ||
      !result.shares.some((share) => share.memberId === caller.member.userId)
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}
