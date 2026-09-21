import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { PlaceLeftovers, LeftoverPlacementReceipt } from "@nest/contracts/meal-leftovers";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";

export function placeLeftovers(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const command = yield* Schema.decodeUnknownEffect(PlaceLeftovers)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const { operationId, ...payload } = command;
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_place_leftovers", {
      p_household: caller.member.householdId,
      p_operation: operationId.toLowerCase(),
      p_input: { ...payload, entryId: payload.entryId.toLowerCase() },
    });
    const receipt = yield* Schema.decodeUnknownEffect(LeftoverPlacementReceipt)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      !matchesIdentity(receipt, caller, operationId) ||
      receipt.sourceWeekStart !== command.sourceWeekStart ||
      receipt.targetWeekStart !== command.targetWeekStart ||
      receipt.date !== command.date ||
      receipt.slot !== command.slot ||
      receipt.sourceEntryId !== command.entryId.toLowerCase() ||
      BigInt(receipt.sourceRevision) !==
        BigInt(command.expectedSourceRevision) + sourceDelta(command) ||
      BigInt(receipt.targetRevision) !== BigInt(command.expectedTargetRevision) + 1n
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return receipt;
  });
}

function matchesIdentity(
  receipt: LeftoverPlacementReceipt,
  caller: AuthorizedCaller,
  operationId: string,
) {
  return (
    receipt.actorId === caller.member.userId &&
    receipt.householdId === caller.member.householdId &&
    receipt.operationId === operationId.toLowerCase()
  );
}

function sourceDelta(command: PlaceLeftovers) {
  return command.sourceWeekStart === command.targetWeekStart ? 1n : 0n;
}
