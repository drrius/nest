import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CreateMealPreparation, MealPreparationReceipt } from "@nest/contracts/meal-preparation";
import { PreferenceFailure, preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
const Envelope = Schema.Struct({ version: Schema.Literal(1), receipt: MealPreparationReceipt });
export function mealPreparationCreateClient(
  request: ReturnType<typeof preferenceRequests>,
  account: Account,
) {
  return (input: CreateMealPreparation) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(CreateMealPreparation)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const { receipt } = yield* request("v1/meals/preparation/create", Envelope, command);
      if (
        !matchesIdentity(receipt, account, command.operationId) ||
        receipt.entryId !== command.entryId.toLowerCase() ||
        receipt.weekStart !== command.weekStart ||
        receipt.revision !== command.expectedRevision ||
        receipt.dueOn !== command.preparation.dueOn
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      return receipt;
    });
}

function matchesIdentity(receipt: MealPreparationReceipt, account: Account, operation: string) {
  return (
    receipt.actorId === account.actor &&
    receipt.householdId === account.household &&
    receipt.operationId === operation.toLowerCase()
  );
}
