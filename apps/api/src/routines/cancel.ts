import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CreateRoutine, RoutineCancellation } from "@nest/contracts/routines";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";

export function cancelRoutineCreation(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) {
  return Effect.gen(function* () {
    const command = yield* Schema.decodeUnknownEffect(CreateRoutine)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const raw = yield* requestJson(
      config,
      caller.token,
      "rest/v1/rpc/nest_cancel_routine_creation",
      {
        p_household: caller.member.householdId,
        p_operation: command.operationId.toLowerCase(),
        p_definition: command.definition,
      },
    );
    const result = yield* Schema.decodeUnknownEffect(RoutineCancellation)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      result.actorId !== caller.member.userId ||
      result.householdId !== caller.member.householdId ||
      result.operationId !== command.operationId.toLowerCase()
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}
