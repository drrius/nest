import { createMealPreparation } from "./preparation-create.ts";
import { mealPreparationRoute } from "./preparation-read.ts";
import { placeLeftovers } from "./leftovers.ts";
import { ApiFailure } from "../errors.ts";
import { plannedRecipeRoute } from "./planned-recipe.ts";
import { placeRecipe } from "./recipe-placement.ts";
import { replaceWithRecipe } from "./recipe-replacement.ts";
import { editRecipe } from "./recipe-edit.ts";
import { archiveRecipe } from "./recipe-archive.ts";
import { createRecipe } from "./recipe-creation.ts";
import { mealLibraryRoute } from "./library-read.ts";
import { replaceMeal } from "./replacement.ts";
import * as Effect from "effect/Effect";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { commandBody } from "../request-body.ts";
import { mealWeekRoute } from "./read.ts";
import { placeMeal } from "./placement.ts";
import { moveMeal } from "./move.ts";
import { removeMeal } from "./removal.ts";
export function mealRoute(request: Request, config: IdentityConfig, caller: AuthorizedCaller) {
  if (new URL(request.url).pathname === "/v1/meals/preparation")
    return mealPreparationRoute(request, config, caller);
  if (new URL(request.url).pathname === "/v1/meals/planned-recipe")
    return plannedRecipeRoute(request, config, caller);
  if (new URL(request.url).pathname === "/v1/meals/week")
    return mealWeekRoute(request, config, caller);
  if (["/v1/meals/library", "/v1/meals/recipe"].includes(new URL(request.url).pathname))
    return mealLibraryRoute(request, config, caller);
  return Effect.gen(function* () {
    const path = new URL(request.url).pathname;
    if (path === "/v1/meals/recipe/edit")
      return {
        version: 1,
        receipt: yield* editRecipe(config, caller, yield* commandBody(request, 2097152)),
      };
    if (path === "/v1/meals/recipe/create")
      return {
        version: 1,
        receipt: yield* createRecipe(config, caller, yield* commandBody(request, 2097152)),
      };
    if (path === "/v1/meals/recipe/archive")
      return {
        version: 1,
        receipt: yield* archiveRecipe(config, caller, yield* commandBody(request)),
      };
    const command = commands[path as keyof typeof commands];
    if (!command) return yield* new ApiFailure({ code: "invalid_request" });
    const receipt = yield* command(
      config,
      caller,
      yield* commandBody(request, path === "/v1/meals/preparation/create" ? 32768 : 8192),
    );
    return { version: 1, receipt };
  });
}

const commands = {
  "/v1/meals/preparation/create": createMealPreparation,
  "/v1/meals/recipe/place": placeRecipe,
  "/v1/meals/recipe/replace": replaceWithRecipe,
  "/v1/meals/replace": replaceMeal,
  "/v1/meals/move": moveMeal,
  "/v1/meals/remove": removeMeal,
  "/v1/meals/place": placeMeal,
  "/v1/meals/leftovers": placeLeftovers,
};
