import { mealProposalClient } from "./proposal-client.ts";
import { mealIngredientClient } from "./ingredient-client.ts";
import { mealPreparationEditClient } from "./preparation-edit-client.ts";
import { mealPreparationCreateClient } from "./preparation-create-client.ts";
import { mealPreparationReadClient } from "./preparation-read-client.ts";
import { mealLeftoversClient } from "./leftovers-client.ts";
import { recipePlacementClient } from "./recipe-placement-client.ts";
import { recipeReplacementClient } from "./recipe-replacement-client.ts";
import { plannedRecipeClient } from "./planned-recipe-client.ts";
import { recipeEditClient } from "./recipe-edit-client.ts";
import { recipeArchiveClient } from "./recipe-archive-client.ts";
import { recipeCreationClient } from "./recipe-creation-client.ts";
import { mealLibraryClient } from "./library-client.ts";
import { mealReplacementClient } from "./replacement-client.ts";
import { mealMoveClient } from "./move-client.ts";
import { mealRemovalClient } from "./removal-client.ts";
import { mealPlacementClient } from "./placement-client.ts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ReadMealWeek, MealWeekSnapshot } from "@nest/contracts/meals";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";

export function mealClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    ingredients: mealIngredientClient(request, account),
    proposals: mealProposalClient(
      request,
      preferenceRequests(apiUrl, account, credentials, "180 seconds"),
      account,
    ),
    editPreparation: mealPreparationEditClient(request, account),
    createPreparation: mealPreparationCreateClient(request, account),
    readPreparation: mealPreparationReadClient(request, account),
    library: mealLibraryClient(request, account),
    placeRecipe: recipePlacementClient(request, account),
    replaceWithRecipe: recipeReplacementClient(request, account),
    plannedRecipe: plannedRecipeClient(request, account),
    createRecipe: recipeCreationClient(request, account),
    editRecipe: recipeEditClient(request, account),
    archiveRecipe: recipeArchiveClient(request, account),
    place: mealPlacementClient(request, account),
    replace: mealReplacementClient(request, account),
    move: mealMoveClient(request, account),
    placeLeftovers: mealLeftoversClient(request, account),
    remove: mealRemovalClient(request, account),
    read: (weekStart: string) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(ReadMealWeek)({ weekStart }).pipe(
          Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
        );
        const result = yield* request(
          `v1/meals/week?weekStart=${encodeURIComponent(query.weekStart)}`,
          MealWeekSnapshot,
        );
        if (result.householdId !== account.household || result.weekStart !== query.weekStart)
          return yield* new PreferenceFailure({ code: "forbidden" });
        return result;
      }),
  };
}
export type MealClient = ReturnType<typeof mealClient>;
