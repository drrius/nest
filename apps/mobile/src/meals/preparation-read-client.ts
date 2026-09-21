import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  ReadMealPreparation,
  MealPreparationEnvelope,
} from "@nest/contracts/meal-preparation-read";
import { PreferenceFailure, type preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
export function mealPreparationReadClient(
  request: ReturnType<typeof preferenceRequests>,
  account: Account,
) {
  return (input: ReadMealPreparation) =>
    Effect.gen(function* () {
      const query = yield* Schema.decodeUnknownEffect(ReadMealPreparation)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const params = new URLSearchParams({ ...query, entryId: query.entryId.toLowerCase() });
      const result = yield* request(`v1/meals/preparation?${params}`, MealPreparationEnvelope);
      if (result.householdId !== account.household)
        return yield* new PreferenceFailure({ code: "forbidden" });
      if (
        result.weekStart !== query.weekStart ||
        result.revision !== query.revision ||
        result.entryId !== query.entryId.toLowerCase() ||
        (result.entry !== null && result.entry.entryId !== query.entryId.toLowerCase())
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      return result;
    });
}
