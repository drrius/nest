import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { RoutineStateCommand, RoutineCreateEnvelope } from "@nest/contracts/routines";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";

export function routineStateClient(
  request: ReturnType<typeof preferenceRequests>,
  account: Account,
) {
  return (input: typeof RoutineStateCommand.Type) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(RoutineStateCommand)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const { receipt } = yield* request("v1/routines/state", RoutineCreateEnvelope, command);
      if (
        receipt.actorId !== account.actor ||
        receipt.householdId !== account.household ||
        receipt.operationId !== command.operationId.toLowerCase() ||
        receipt.routineId !== command.routineId.toLowerCase() ||
        receipt.action !== command.action
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      return receipt;
    });
}
