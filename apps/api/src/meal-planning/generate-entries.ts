import * as Effect from "effect/Effect";
import { structuredGeneration } from "@nest/ai/structured";
import type { AssistantModel } from "@nest/ai/chat";
import type { ProposedMeal } from "@nest/contracts/meal-proposals";
import {
  GeneratedChoices,
  ConstraintChecks,
  MealGenerationFailure,
  type PlanningGenerationInput,
} from "./generation-schema.ts";
import { slotKey, type PreparedGeneration } from "./generation-input.ts";
import { generateInstructions, checkInstructions } from "./generation-prompts.ts";
function bindChoices(
  input: PlanningGenerationInput,
  prepared: PreparedGeneration,
  generated: GeneratedChoices,
) {
  const expected = new Set(prepared.slots.map(slotKey)),
    seen = new Set(generated.meals.map(slotKey));
  if (
    seen.size !== generated.meals.length ||
    seen.size !== expected.size ||
    [...seen].some((key) => !expected.has(key))
  )
    throw new MealGenerationFailure({ reason: "unavailable" });
  return generated.meals.map((meal): Omit<ProposedMeal, "entryId"> => {
    const { choice, ...slot } = meal;
    if (choice.kind === "suggested") {
      if (input.familiarOnly) throw new MealGenerationFailure({ reason: "no_suitable_meals" });
      return { ...slot, source: { kind: "suggested", recipe: choice.recipe } };
    }
    const recipe = input.library.recipes.find(
      (item) => item.definitionId.toLowerCase() === choice.definitionId.toLowerCase(),
    );
    if (!recipe || !recipe.servings || !recipe.instructions?.trim() || !recipe.ingredients.length)
      throw new MealGenerationFailure({ reason: "no_suitable_meals" });
    return { ...slot, source: { kind: "saved", recipe, libraryRevision: input.library.revision } };
  });
}
function acceptedChecks(
  entries: readonly Omit<ProposedMeal, "entryId">[],
  checks: typeof ConstraintChecks.Type,
) {
  const expected = new Set(entries.map(slotKey)),
    seen = new Set(checks.checks.map(slotKey));
  return (
    checks.checks.length === expected.size &&
    seen.size === expected.size &&
    checks.checks.every((check) => expected.has(slotKey(check)) && check.result === "safe")
  );
}
export function checkMealEntries(
  model: AssistantModel,
  prepared: PreparedGeneration,
  entries: readonly Omit<ProposedMeal, "entryId">[],
) {
  return Effect.gen(function* () {
    const checked = yield* structuredGeneration({
      model,
      schema: ConstraintChecks,
      instructions: checkInstructions,
      data: {
        members: prepared.members,
        cooking: prepared.cooking,
        meals: entries.map((entry) => ({
          date: entry.date,
          slot: entry.slot,
          recipe: entry.source.recipe,
        })),
      },
    });
    if (!acceptedChecks(entries, checked))
      return yield* new MealGenerationFailure({ reason: "no_suitable_meals" });
  });
}
export function generatePreparedMeals(
  model: AssistantModel,
  input: PlanningGenerationInput,
  prepared: PreparedGeneration,
  instructions = generateInstructions,
) {
  return Effect.gen(function* () {
    const generated = yield* structuredGeneration({
      model,
      schema: GeneratedChoices,
      instructions,
      data: prepared,
    });
    const entries = yield* Effect.try({
      try: () => bindChoices(input, prepared, generated),
      catch: (error) =>
        error instanceof MealGenerationFailure
          ? error
          : new MealGenerationFailure({ reason: "unavailable" }),
    });
    yield* checkMealEntries(model, prepared, entries);
    return entries;
  });
}
