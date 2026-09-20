import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { RoutineStateCommand, RoutineReceipt } from "@nest/contracts/routines";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";

export function setRoutineState(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const command = yield* Schema.decodeUnknownEffect(RoutineStateCommand)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_set_routine_state", {
      p_household: caller.member.householdId,
      p_operation: command.operationId.toLowerCase(),
      p_routine: command.routineId.toLowerCase(),
      p_expected: command.expectedVersion,
      p_action: command.action,
    });
    const receipt = yield* Schema.decodeUnknownEffect(RoutineReceipt)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      receipt.actorId !== caller.member.userId ||
      receipt.householdId !== caller.member.householdId ||
      receipt.operationId !== command.operationId.toLowerCase() ||
      receipt.routineId !== command.routineId.toLowerCase() ||
      receipt.action !== command.action
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return receipt;
  });
}
