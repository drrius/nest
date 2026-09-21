import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  EditMealPreparation,
  MealPreparationEditReceipt,
} from "@nest/contracts/meal-preparation-edit";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";

export function editMealPreparation(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) {
  return Effect.gen(function* () {
    const command = yield* Schema.decodeUnknownEffect(EditMealPreparation)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const { operationId, ...payload } = command;
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_edit_meal_preparation", {
      p_household: caller.member.householdId,
      p_operation: operationId.toLowerCase(),
      p_input: {
        ...payload,
        entryId: payload.entryId.toLowerCase(),
        routineId: payload.routineId.toLowerCase(),
      },
    });
    const receipt = yield* Schema.decodeUnknownEffect(MealPreparationEditReceipt)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      !matchesIdentity(receipt, caller, operationId) ||
      receipt.entryId !== command.entryId.toLowerCase() ||
      receipt.weekStart !== command.weekStart ||
      receipt.revision !== command.expectedRevision ||
      receipt.routineId !== command.routineId.toLowerCase() ||
      receipt.previousRoutineVersion !== command.expectedRoutineVersion ||
      (command.patch.dueOn !== undefined && receipt.dueOn !== command.patch.dueOn)
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return receipt;
  });
}

function matchesIdentity(
  receipt: MealPreparationEditReceipt,
  caller: AuthorizedCaller,
  operationId: string,
) {
  return (
    receipt.actorId === caller.member.userId &&
    receipt.householdId === caller.member.householdId &&
    receipt.operationId === operationId.toLowerCase()
  );
}
