import * as Schema from "effect/Schema";
import {
  MealProposalEnvelope,
  ProposedMeal,
  ProposedMealSource,
} from "@nest/contracts/meal-proposals";
import { SavedMeal } from "@nest/contracts/meal-library";
import { PlanningGenerationInput, MealGenerationFailure } from "./generation-schema.ts";
import { prepareGeneration, slotKey } from "./generation-input.ts";
export const SingleMealGenerationInput = Schema.Struct({
  planning: PlanningGenerationInput,
  envelope: MealProposalEnvelope,
  entryId: ProposedMeal.fields.entryId,
  // Non-null selects an exact recipe already read through the authorized library service.
  selection: Schema.NullOr(SavedMeal.fields.definitionId),
}).check(
  Schema.makeFilter(
    ({ planning, envelope }) =>
      envelope.actorId === planning.context.actorId &&
      envelope.householdId === planning.context.householdId &&
      envelope.proposal.weekStart === planning.week.weekStart &&
      envelope.proposal.weekRevision === planning.week.revision &&
      envelope.proposal.familiarOnly === planning.familiarOnly,
  ),
);
export type SingleMealGenerationInput = typeof SingleMealGenerationInput.Type;
const unavailable = () => new MealGenerationFailure({ reason: "unavailable" });
export function prepareSingleMeal(input: SingleMealGenerationInput, now: number) {
  const proposal = input.envelope.proposal;
  if (proposal.status !== "ready" || proposal.expiresAt <= now) throw unavailable();
  const entry = proposal.entries?.find(
    (item) => item.entryId.toLowerCase() === input.entryId.toLowerCase(),
  );
  if (!entry) throw unavailable();
  const prepared = prepareGeneration(input.planning, now);
  const slots = prepared.slots.filter((slot) => slotKey(slot) === slotKey(entry));
  if (slots.length !== 1) throw unavailable();
  return {
    entry,
    prepared: {
      ...prepared,
      slots,
      previousRecipe: entry.source.recipe,
      otherMeals: proposal
        .entries!.filter((item) => item.entryId !== entry.entryId)
        .map((item) => ({
          date: item.date,
          slot: item.slot,
          title: item.source.recipe.title,
        })),
    },
  };
}
export function selectedMeal(
  input: SingleMealGenerationInput,
  entry: ProposedMeal,
): Omit<ProposedMeal, "entryId"> {
  const recipe = input.planning.library.recipes.find(
    (item) => item.definitionId.toLowerCase() === input.selection?.toLowerCase(),
  );
  if (!recipe || !recipe.servings || !recipe.instructions?.trim() || !recipe.ingredients.length)
    throw new MealGenerationFailure({ reason: "no_suitable_meals" });
  return {
    date: entry.date,
    slot: entry.slot,
    estimatedCaloriesPerServing: null,
    source: { kind: "saved", libraryRevision: input.planning.library.revision, recipe },
  };
}
export function sameMeal(first: ProposedMeal["source"], second: ProposedMeal["source"]) {
  if (first.kind === "saved" && second.kind === "saved")
    return first.recipe.definitionId.toLowerCase() === second.recipe.definitionId.toLowerCase();
  return Schema.toEquivalence(ProposedMealSource)(first, second);
}
