import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { MoveMeal, MealMoveReceipt } from "@nest/contracts/meal-move";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";

export function moveMeal(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const command = yield* Schema.decodeUnknownEffect(MoveMeal)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const { operationId, ...payload } = command;
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_move_meal", {
      p_household: caller.member.householdId,
      p_operation: operationId.toLowerCase(),
      p_input: { ...payload, entryId: payload.entryId.toLowerCase() },
    });
    const receipt = yield* Schema.decodeUnknownEffect(MealMoveReceipt)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      !matchesIdentity(receipt, caller, operationId) ||
      receipt.sourceWeekStart !== command.sourceWeekStart ||
      receipt.targetWeekStart !== command.targetWeekStart ||
      receipt.date !== command.date ||
      receipt.slot !== command.slot ||
      receipt.entryId !== command.entryId.toLowerCase() ||
      BigInt(receipt.sourceRevision) !== BigInt(command.expectedSourceRevision) + 1n ||
      BigInt(receipt.targetRevision) !== BigInt(command.expectedTargetRevision) + 1n
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return receipt;
  });
}

function matchesIdentity(receipt: MealMoveReceipt, caller: AuthorizedCaller, operationId: string) {
  return (
    receipt.actorId === caller.member.userId &&
    receipt.householdId === caller.member.householdId &&
    receipt.operationId === operationId.toLowerCase()
  );
}
