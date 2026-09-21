import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ProposedMeal } from "@nest/contracts/meal-proposals";
import type { AssistantModel } from "@nest/ai/chat";
import { MealGenerationFailure } from "./generation-schema.ts";
import { generatePreparedMeals, checkMealEntries } from "./generate-entries.ts";
import { generateInstructions } from "./generation-prompts.ts";
import {
  SingleMealGenerationInput,
  prepareSingleMeal,
  selectedMeal,
  sameMeal,
} from "./single-meal-input.ts";
const instructions = `${generateInstructions}
Replace only the supplied dated slot with a different suitable meal from previousRecipe.
OtherMeals are context for variety, not slots to regenerate or change. Do not return the previous saved recipe.`;
const failure = (error: unknown) =>
  error instanceof MealGenerationFailure
    ? error
    : new MealGenerationFailure({ reason: "unavailable" });

// Internal model operation only. A caller must authorize/reserve a single edit before dispatch,
// then atomically persist this one entry against the same proposal revision and fresh constraints.
export function generateSingleMeal(model: AssistantModel, value: unknown) {
  return Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknownEffect(SingleMealGenerationInput, {
      onExcessProperty: "error",
    })(value);
    const input = structuredClone(decoded),
      now = yield* Clock.currentTimeMillis;
    const { entry, prepared } = yield* Effect.try({
      try: () => prepareSingleMeal(input, now),
      catch: failure,
    });
    let replacement: Omit<ProposedMeal, "entryId">;
    if (input.selection !== null) {
      replacement = yield* Effect.try({ try: () => selectedMeal(input, entry), catch: failure });
      if (sameMeal(entry.source, replacement.source))
        return yield* new MealGenerationFailure({ reason: "no_suitable_meals" });
      yield* checkMealEntries(model, prepared, [replacement]);
    } else {
      const entries = yield* generatePreparedMeals(model, input.planning, prepared, instructions);
      if (entries.length !== 1 || sameMeal(entry.source, entries[0]!.source))
        return yield* new MealGenerationFailure({ reason: "no_suitable_meals" });
      replacement = entries[0]!;
    }
    return yield* Schema.decodeUnknownEffect(ProposedMeal, { onExcessProperty: "error" })({
      ...replacement,
      entryId: entry.entryId,
    });
  }).pipe(Effect.mapError(failure));
}
