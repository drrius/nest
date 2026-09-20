import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { MoveMeal, MealMoveReceipt } from "@nest/contracts/meal-move";
import { PreferenceFailure, preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
const Envelope = Schema.Struct({ version: Schema.Literal(1), receipt: MealMoveReceipt });
export function mealMoveClient(request: ReturnType<typeof preferenceRequests>, account: Account) {
  return (input: MoveMeal) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(MoveMeal)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const { receipt } = yield* request("v1/meals/move", Envelope, command);
      if (
        !matchesIdentity(receipt, account, command.operationId) ||
        receipt.sourceWeekStart !== command.sourceWeekStart ||
        receipt.targetWeekStart !== command.targetWeekStart ||
        receipt.date !== command.date ||
        receipt.slot !== command.slot ||
        receipt.entryId !== command.entryId.toLowerCase() ||
        BigInt(receipt.sourceRevision) !== BigInt(command.expectedSourceRevision) + 1n ||
        BigInt(receipt.targetRevision) !== BigInt(command.expectedTargetRevision) + 1n
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      return receipt;
    });
}

function matchesIdentity(receipt: MealMoveReceipt, account: Account, operation: string) {
  return (
    receipt.actorId === account.actor &&
    receipt.householdId === account.household &&
    receipt.operationId === operation.toLowerCase()
  );
}
