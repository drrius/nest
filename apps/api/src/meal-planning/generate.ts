import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { AssistantModel } from "@nest/ai/chat";
import { structuredGeneration } from "@nest/ai/structured";
import { MealProposalContent, type ProposedMeal } from "@nest/contracts/meal-proposals";
import {
  PlanningGenerationInput,
  GeneratedChoices,
  ConstraintChecks,
  MealGenerationFailure,
} from "./generation-schema.ts";
import { prepareGeneration, slotKey, type PreparedGeneration } from "./generation-input.ts";
import { generateInstructions, checkInstructions } from "./generation-prompts.ts";
const failure = (error: unknown) =>
  error instanceof MealGenerationFailure
    ? error
    : new MealGenerationFailure({ reason: "unavailable" });
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
// Internal orchestration only: callers must supply freshly authorized reads and reserve a
// private operation before calling. It does not persist or approve content or expose a route.
export function generateMealContent(
  model: AssistantModel,
  value: unknown,
  makeId = () => crypto.randomUUID(),
) {
  return Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknownEffect(PlanningGenerationInput, {
      onExcessProperty: "error",
    })(value);
    const input = structuredClone(decoded);
    const now = yield* Clock.currentTimeMillis;
    const prepared = yield* Effect.try({
      try: () => prepareGeneration(input, now),
      catch: failure,
    });
    const generated = yield* structuredGeneration({
      model,
      schema: GeneratedChoices,
      instructions: generateInstructions,
      data: prepared,
    });
    const entries = yield* Effect.try({
      try: () => bindChoices(input, prepared, generated),
      catch: failure,
    });
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
    const identified = yield* Effect.try({
      try: () => entries.map((entry) => ({ ...entry, entryId: makeId() })),
      catch: failure,
    });
    return yield* Schema.decodeUnknownEffect(MealProposalContent, { onExcessProperty: "error" })({
      weekStart: input.week.weekStart,
      familiarOnly: input.familiarOnly,
      entries: identified,
    });
  }).pipe(Effect.mapError(failure));
}
