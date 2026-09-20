import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { RemoveMeal, MealRemovalReceipt } from "@nest/contracts/meal-removal";
import { PreferenceFailure, preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
const Envelope = Schema.Struct({ version: Schema.Literal(1), receipt: MealRemovalReceipt });
export function mealRemovalClient(
  request: ReturnType<typeof preferenceRequests>,
  account: Account,
) {
  return (input: RemoveMeal) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(RemoveMeal)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const { receipt } = yield* request("v1/meals/remove", Envelope, command);
      if (
        receipt.actorId !== account.actor ||
        receipt.householdId !== account.household ||
        receipt.operationId !== command.operationId.toLowerCase() ||
        receipt.weekStart !== command.weekStart ||
        receipt.entryId !== command.entryId.toLowerCase() ||
        BigInt(receipt.revision) !== BigInt(command.expectedRevision) + 1n
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      return receipt;
    });
}
