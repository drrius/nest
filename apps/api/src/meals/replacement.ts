import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ReplaceMeal, MealReplacementReceipt } from "@nest/contracts/meal-replacement";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";

export function replaceMeal(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const command = yield* Schema.decodeUnknownEffect(ReplaceMeal)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const { operationId, ...payload } = command;
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_replace_meal", {
      p_household: caller.member.householdId,
      p_operation: operationId.toLowerCase(),
      p_input: { ...payload, entryId: payload.entryId.toLowerCase() },
    });
    const receipt = yield* Schema.decodeUnknownEffect(MealReplacementReceipt)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      receipt.actorId !== caller.member.userId ||
      receipt.householdId !== caller.member.householdId ||
      receipt.operationId !== operationId.toLowerCase() ||
      receipt.previousEntryId !== command.entryId.toLowerCase() ||
      receipt.weekStart !== command.weekStart ||
      receipt.date !== command.date ||
      receipt.slot !== command.slot ||
      BigInt(receipt.revision) !== BigInt(command.expectedRevision) + 2n
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return receipt;
  });
}
