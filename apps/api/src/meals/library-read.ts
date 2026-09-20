import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  MealLibraryPage,
  ReadMealLibrary,
  ReadSavedMeal,
  SavedMealEnvelope,
} from "@nest/contracts/meal-library";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";

export function readMealLibrary(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(ReadMealLibrary)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const afterId = query.afterId?.toLowerCase() ?? null;
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_meal_library_page", {
      p_household: caller.member.householdId,
      p_after: afterId,
      p_expected: query.expectedRevision,
    });
    const result = yield* Schema.decodeUnknownEffect(MealLibraryPage)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      result.householdId !== caller.member.householdId ||
      (query.expectedRevision !== null && result.revision !== query.expectedRevision) ||
      (afterId !== null && result.meals.some((meal) => meal.definitionId.toLowerCase() <= afterId))
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}
export function readSavedMeal(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(ReadSavedMeal)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const definitionId = query.definitionId.toLowerCase();
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_saved_meal", {
      p_household: caller.member.householdId,
      p_definition: definitionId,
      p_expected: query.expectedRevision,
    });
    const result = yield* Schema.decodeUnknownEffect(SavedMealEnvelope)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      result.householdId !== caller.member.householdId ||
      result.revision !== query.expectedRevision ||
      (result.recipe !== null && result.recipe.definitionId.toLowerCase() !== definitionId)
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}
export function mealLibraryRoute(
  request: Request,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  const { pathname, searchParams } = new URL(request.url);
  const library = pathname === "/v1/meals/library";
  const keys = [library ? "afterId" : "definitionId", "expectedRevision"];
  if (
    Array.from(searchParams.keys()).some((key) => !keys.includes(key)) ||
    new Set(searchParams.keys()).size !== searchParams.size
  )
    return Effect.fail(new ApiFailure({ code: "invalid_request" }));
  return library
    ? readMealLibrary(config, caller, {
        afterId: searchParams.get("afterId"),
        expectedRevision: searchParams.get("expectedRevision"),
      })
    : readSavedMeal(config, caller, {
        definitionId: searchParams.get("definitionId"),
        expectedRevision: searchParams.get("expectedRevision"),
      });
}
