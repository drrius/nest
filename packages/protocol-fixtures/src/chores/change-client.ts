import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { SkipChore, RescheduleChore } from "@nest/contracts/routines";
import { ChoreChangeEnvelope } from "@nest/contracts/chore-changes";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";

export function choreChanges(request: ReturnType<typeof preferenceRequests>, account: Account) {
  const change = (action: "skip" | "reschedule", input: unknown) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(
        action === "skip" ? SkipChore : RescheduleChore,
      )(input, { onExcessProperty: "error" }).pipe(
        Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
      );
      const { receipt } = yield* request(`v1/chores/${action}`, ChoreChangeEnvelope, command);
      const dueDate = "newDueDate" in command ? command.newDueDate : command.expectedDueDate;
      if (
        receipt.actorId !== account.actor ||
        receipt.householdId !== account.household ||
        receipt.operationId !== command.operationId.toLowerCase() ||
        receipt.occurrenceId !== command.occurrenceId.toLowerCase() ||
        receipt.previousDueDate !== command.expectedDueDate ||
        receipt.action !== action ||
        receipt.dueDate !== dueDate
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      return receipt;
    });
  return {
    skip: (command: typeof SkipChore.Type) => change("skip", command),
    reschedule: (command: typeof RescheduleChore.Type) => change("reschedule", command),
  };
}
