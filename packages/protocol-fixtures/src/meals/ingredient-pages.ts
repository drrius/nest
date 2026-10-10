import * as Effect from "effect/Effect";
import {
  sourceKey,
  type MealIngredient,
  type MealIngredientPage,
} from "@nest/contracts/meal-ingredients";
import { PreferenceFailure } from "../preferences/client.ts";
import type { MealClient } from "./client.ts";
export function readIngredientPages(
  client: MealClient["ingredients"],
  weekStart: string,
  revision: string,
) {
  return Effect.gen(function* () {
    const ingredients: MealIngredient[] = [];
    let after: MealIngredientPage["nextAfter"] = null;
    let skipped: MealIngredientPage["skipped"] | null = null;
    const meals = new Map<string, string>();
    const groceryIds = new Set<string>();
    for (let n = 0; n < 42; n++) {
      const page: MealIngredientPage = yield* client.read({
        weekStart,
        expectedRevision: revision,
        after,
      });
      if (skipped !== null && JSON.stringify(skipped) !== JSON.stringify(page.skipped))
        return yield* new PreferenceFailure({ code: "conflict" });
      skipped = page.skipped;
      if (!consistentRows(page.ingredients, meals, groceryIds))
        return yield* new PreferenceFailure({ code: "unavailable" });
      if (
        ingredients.length &&
        page.ingredients.some((row) => sourceKey(row) <= sourceKey(ingredients.at(-1)!))
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      ingredients.push(...page.ingredients);
      if (page.nextAfter === null) return { ingredients, skipped };
      after = page.nextAfter;
    }
    return yield* new PreferenceFailure({ code: "unavailable" });
  });
}

function consistentRows(
  rows: readonly MealIngredient[],
  meals: Map<string, string>,
  groceryIds: Set<string>,
) {
  return rows.every((row) => {
    const details = JSON.stringify([row.mealTitle, row.date, row.slot]);
    const key = row.entryId.toLowerCase(),
      prior = meals.get(key);
    if (
      (prior !== undefined && prior !== details) ||
      (row.groceryItemId !== null && groceryIds.has(row.groceryItemId.toLowerCase()))
    )
      return false;
    meals.set(key, details);
    if (row.groceryItemId) groceryIds.add(row.groceryItemId.toLowerCase());
    return true;
  });
}
