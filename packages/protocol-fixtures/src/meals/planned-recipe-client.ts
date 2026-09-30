import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ReadPlannedRecipe, PlannedRecipeEnvelope } from "@nest/contracts/recipe-selection";
import { PreferenceFailure, type preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
export function plannedRecipeClient(
  request: ReturnType<typeof preferenceRequests>,
  account: Account,
) {
  return (input: ReadPlannedRecipe) =>
    Effect.gen(function* () {
      const query = yield* Schema.decodeUnknownEffect(ReadPlannedRecipe)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const params = new URLSearchParams({ ...query, entryId: query.entryId.toLowerCase() });
      const result = yield* request(`v1/meals/planned-recipe?${params}`, PlannedRecipeEnvelope);
      if (result.householdId !== account.household)
        return yield* new PreferenceFailure({ code: "forbidden" });
      if (
        result.weekStart !== query.weekStart ||
        result.revision !== query.revision ||
        (result.entry !== null && result.entry.entryId !== query.entryId.toLowerCase())
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      return result;
    });
}
