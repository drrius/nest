import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  MealLibraryPage,
  ReadMealLibrary,
  ReadSavedMeal,
  SavedMealEnvelope,
} from "@nest/contracts/meal-library";
import { PreferenceFailure, type preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
export function mealLibraryClient(
  request: ReturnType<typeof preferenceRequests>,
  account: Account,
) {
  return {
    read: (afterId: string | null = null, expectedRevision: string | null = null) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(ReadMealLibrary)({
          afterId,
          expectedRevision,
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const params = new URLSearchParams();
        if (query.afterId !== null) params.set("afterId", query.afterId.toLowerCase());
        if (query.expectedRevision !== null) params.set("expectedRevision", query.expectedRevision);
        const result = yield* request(`v1/meals/library?${params}`, MealLibraryPage);
        if (result.householdId !== account.household)
          return yield* new PreferenceFailure({ code: "forbidden" });
        if (
          (query.expectedRevision !== null && query.expectedRevision !== result.revision) ||
          (query.afterId !== null &&
            result.meals.some(
              (meal) => meal.definitionId.toLowerCase() <= query.afterId!.toLowerCase(),
            ))
        )
          return yield* new PreferenceFailure({ code: "unavailable" });
        return result;
      }),
    recipe: (definitionId: string, expectedRevision: string) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(ReadSavedMeal)({
          definitionId,
          expectedRevision,
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const params = new URLSearchParams({
          definitionId: query.definitionId.toLowerCase(),
          expectedRevision: query.expectedRevision,
        });
        const result = yield* request(`v1/meals/recipe?${params}`, SavedMealEnvelope);
        if (result.householdId !== account.household)
          return yield* new PreferenceFailure({ code: "forbidden" });
        if (
          result.revision !== query.expectedRevision ||
          (result.recipe !== null &&
            result.recipe.definitionId.toLowerCase() !== query.definitionId.toLowerCase())
        )
          return yield* new PreferenceFailure({ code: "unavailable" });
        return result;
      }),
  };
}
export type MealLibraryClient = ReturnType<typeof mealLibraryClient>;
