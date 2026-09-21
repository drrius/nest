import * as Effect from "effect/Effect";
import { ReadMealWeek } from "@nest/contracts/meals";
import { ReadMealIngredients, MealIngredientReviewHandoff } from "@nest/contracts/meal-ingredients";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { readMealIngredients } from "./ingredients.ts";
import { readMealWeek } from "./read.ts";
const failure = (error: { code: string }) =>
  new CommandFailure({
    code:
      error.code === "conflict"
        ? "conflict"
        : error.code === "unavailable"
          ? "unavailable"
          : "forbidden",
  });
export function mealIngredientTools(request: Request, config: IdentityConfig) {
  const caller = Effect.gen(function* () {
    return { member: yield* currentMember(request), token: yield* bearerToken(request) };
  });
  return {
    readMealIngredients: effectTool({
      description:
        "Read one page of retained ingredients from a saved meal week at its exact fresh revision. Preserve quantities, units and separate source identities. Continue nextAfter with the same revision; a partial page is not the complete shopping list. Leftovers and missing recipe ingredients are explicitly skipped. Existing grocery IDs mean those sources were already added, not that the items are still needed or unchecked. This read adds nothing. For selections, exclusions, quantity edits or adding these ingredients, use openMealIngredientReview; never substitute addGrocery or recipe edits.",
      input: ReadMealIngredients,
      execute: (input) =>
        caller.pipe(
          Effect.flatMap((scope) => readMealIngredients(config, scope, input)),
          Effect.provide(supabaseIdentity(config)),
          Effect.mapError(failure),
        ),
    }),
    openMealIngredientReview: effectTool({
      description:
        "Hand off an explicitly chosen meal week to the native ingredient review. This opens a review only: it does not select ingredients, exclude pantry items, change quantities, approve a proposal or add groceries. The member must choose rows and explicitly confirm on their iPhone. Recover an uncertain addition there using its saved request. Never add the meal ingredients through ordinary addGrocery calls or claim this navigation completed shopping-list changes.",
      input: ReadMealWeek,
      execute: (input) =>
        caller.pipe(
          Effect.flatMap((scope) => readMealWeek(config, scope, input)),
          Effect.map((week): typeof MealIngredientReviewHandoff.Type => ({
            kind: "device_handoff",
            screen: "meal-ingredients",
            householdId: week.householdId,
            weekStart: week.weekStart,
            revision: week.revision,
          })),
          Effect.provide(supabaseIdentity(config)),
          Effect.mapError(failure),
        ),
    }),
  };
}
