import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  EditMealPreparation,
  MealPreparationEditReceipt,
} from "@nest/contracts/meal-preparation-edit";
import { PreferenceFailure, preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
const Envelope = Schema.Struct({ version: Schema.Literal(1), receipt: MealPreparationEditReceipt });
export function mealPreparationEditClient(
  request: ReturnType<typeof preferenceRequests>,
  account: Account,
) {
  return (input: EditMealPreparation) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(EditMealPreparation)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const { receipt } = yield* request("v1/meals/preparation/edit", Envelope, command);
      if (
        !matchesIdentity(receipt, account, command.operationId) ||
        receipt.entryId !== command.entryId.toLowerCase() ||
        receipt.weekStart !== command.weekStart ||
        receipt.revision !== command.expectedRevision ||
        receipt.routineId !== command.routineId.toLowerCase() ||
        receipt.previousRoutineVersion !== command.expectedRoutineVersion ||
        (command.patch.dueOn !== undefined && receipt.dueOn !== command.patch.dueOn)
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      return receipt;
    });
}

function matchesIdentity(receipt: MealPreparationEditReceipt, account: Account, operation: string) {
  return (
    receipt.actorId === account.actor &&
    receipt.householdId === account.household &&
    receipt.operationId === operation.toLowerCase()
  );
}
