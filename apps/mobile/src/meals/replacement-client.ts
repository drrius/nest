import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ReplaceMeal, MealReplacementReceipt } from "@nest/contracts/meal-replacement";
import { PreferenceFailure, preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
const Envelope = Schema.Struct({ version: Schema.Literal(1), receipt: MealReplacementReceipt });
export function mealReplacementClient(
  request: ReturnType<typeof preferenceRequests>,
  account: Account,
) {
  return (input: ReplaceMeal) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(ReplaceMeal)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const { receipt } = yield* request("v1/meals/replace", Envelope, command);
      if (
        receipt.actorId !== account.actor ||
        receipt.householdId !== account.household ||
        receipt.operationId !== command.operationId.toLowerCase() ||
        receipt.previousEntryId !== command.entryId.toLowerCase() ||
        receipt.weekStart !== command.weekStart ||
        receipt.date !== command.date ||
        receipt.slot !== command.slot ||
        BigInt(receipt.revision) !== BigInt(command.expectedRevision) + 2n
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      return receipt;
    });
}
