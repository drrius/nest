import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { PlaceMeal, MealPlacementReceipt } from "@nest/contracts/meal-placement";
import { PreferenceFailure, preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
const Envelope = Schema.Struct({ version: Schema.Literal(1), receipt: MealPlacementReceipt });
export function mealPlacementClient(
  request: ReturnType<typeof preferenceRequests>,
  account: Account,
) {
  return (input: PlaceMeal) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(PlaceMeal)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const { receipt } = yield* request("v1/meals/place", Envelope, command);
      if (
        receipt.actorId !== account.actor ||
        receipt.householdId !== account.household ||
        receipt.operationId !== command.operationId.toLowerCase() ||
        receipt.weekStart !== command.weekStart ||
        receipt.date !== command.date ||
        receipt.slot !== command.slot ||
        BigInt(receipt.revision) !== BigInt(command.expectedRevision) + 1n
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      return receipt;
    });
}
