import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CreateMealPreparation, MealPreparationReceipt } from "@nest/contracts/meal-preparation";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";

export function createMealPreparation(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) {
  return Effect.gen(function* () {
    const command = yield* Schema.decodeUnknownEffect(CreateMealPreparation)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const { operationId, ...payload } = command;
    const raw = yield* requestJson(
      config,
      caller.token,
      "rest/v1/rpc/nest_create_meal_preparation",
      {
        p_household: caller.member.householdId,
        p_operation: operationId.toLowerCase(),
        p_input: { ...payload, entryId: payload.entryId.toLowerCase() },
      },
    );
    const receipt = yield* Schema.decodeUnknownEffect(MealPreparationReceipt)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      !matchesIdentity(receipt, caller, operationId) ||
      receipt.entryId !== command.entryId.toLowerCase() ||
      receipt.weekStart !== command.weekStart ||
      receipt.revision !== command.expectedRevision ||
      receipt.dueOn !== command.preparation.dueOn
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return receipt;
  });
}

function matchesIdentity(
  receipt: MealPreparationReceipt,
  caller: AuthorizedCaller,
  operationId: string,
) {
  return (
    receipt.actorId === caller.member.userId &&
    receipt.householdId === caller.member.householdId &&
    receipt.operationId === operationId.toLowerCase()
  );
}
