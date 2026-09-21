import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { MoneyBalance } from "@nest/contracts/money";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
export function readMoneyBalance(config: IdentityConfig, caller: AuthorizedCaller) {
  return Effect.gen(function* () {
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_money_balance", {
      p_household: caller.member.householdId,
    }).pipe(
      Effect.mapError((error) =>
        error.code === "invalid_request" ? new ApiFailure({ code: "unavailable" }) : error,
      ),
    );
    const result = yield* Schema.decodeUnknownEffect(MoneyBalance)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      result.householdId !== caller.member.householdId ||
      !result.members.some((member) => member.actorId === caller.member.userId)
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}
