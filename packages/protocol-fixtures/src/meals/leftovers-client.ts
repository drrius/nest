import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { PlaceLeftovers, LeftoverPlacementReceipt } from "@nest/contracts/meal-leftovers";
import { PreferenceFailure, preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
const Envelope = Schema.Struct({ version: Schema.Literal(1), receipt: LeftoverPlacementReceipt });
export function mealLeftoversClient(
  request: ReturnType<typeof preferenceRequests>,
  account: Account,
) {
  return (input: PlaceLeftovers) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(PlaceLeftovers)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const { receipt } = yield* request("v1/meals/leftovers", Envelope, command);
      if (
        !matchesIdentity(receipt, account, command.operationId) ||
        receipt.sourceWeekStart !== command.sourceWeekStart ||
        receipt.targetWeekStart !== command.targetWeekStart ||
        receipt.date !== command.date ||
        receipt.slot !== command.slot ||
        receipt.sourceEntryId !== command.entryId.toLowerCase() ||
        BigInt(receipt.sourceRevision) !==
          BigInt(command.expectedSourceRevision) +
            (command.sourceWeekStart === command.targetWeekStart ? 1n : 0n) ||
        BigInt(receipt.targetRevision) !== BigInt(command.expectedTargetRevision) + 1n
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      return receipt;
    });
}

function matchesIdentity(receipt: LeftoverPlacementReceipt, account: Account, operation: string) {
  return (
    receipt.actorId === account.actor &&
    receipt.householdId === account.household &&
    receipt.operationId === operation.toLowerCase()
  );
}
