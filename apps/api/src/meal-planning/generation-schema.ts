import * as Schema from "effect/Schema";
import { CalendarDate } from "@nest/contracts/chores";
import { MealSlot } from "@nest/contracts/cooking";
import { MealWeekSnapshot } from "@nest/contracts/meals";
import { SavedMeal } from "@nest/contracts/meal-library";
import { RecipeDraft } from "@nest/contracts/recipe-creation";
import { BusySnapshotsEnvelope } from "@nest/contracts/calendar";

import { ProposedMeal } from "@nest/contracts/meal-proposals";
import { MealPlanningContext } from "./context-schema.ts";
const Uuid = Schema.String.check(Schema.isUUID());
export const PlanningGenerationInput = Schema.Struct({
  context: MealPlanningContext,
  week: MealWeekSnapshot,
  familiarOnly: Schema.Boolean,
  library: Schema.Struct({
    revision: MealWeekSnapshot.fields.revision,
    recipes: Schema.Array(SavedMeal).check(Schema.isMaxLength(50)),
  }),
  busy: BusySnapshotsEnvelope,
}).check(
  Schema.makeFilter((value) => {
    const ids = value.library.recipes.map((recipe) => recipe.definitionId.toLowerCase());
    const members = new Set(value.context.members.map((member) => member.actorId.toLowerCase()));
    return (
      value.week.householdId === value.context.householdId &&
      value.busy.householdId === value.context.householdId &&
      new Set(ids).size === ids.length &&
      new Set(value.busy.snapshots.map((snapshot) => snapshot.actorId.toLowerCase())).size ===
        value.busy.snapshots.length &&
      value.busy.snapshots.every((snapshot) => members.has(snapshot.actorId.toLowerCase()))
    );
  }),
);
const Slot = { date: CalendarDate, slot: MealSlot };
const Suggested = RecipeDraft.check(
  Schema.makeFilter(
    (recipe) =>
      recipe.recipeUrl === null &&
      recipe.ingredients.every((ingredient) => ingredient.categoryId === null),
  ),
);
export const GeneratedChoices = Schema.Struct({
  meals: Schema.Array(
    Schema.Struct({
      ...Slot,
      choice: Schema.Union([
        Schema.Struct({ kind: Schema.Literal("saved"), definitionId: Uuid }),
        Schema.Struct({ kind: Schema.Literal("suggested"), recipe: Suggested }),
      ]),
      estimatedCaloriesPerServing: ProposedMeal.fields.estimatedCaloriesPerServing,
    }),
  ).check(Schema.isLengthBetween(1, 21)),
});
export const ConstraintChecks = Schema.Struct({
  checks: Schema.Array(
    Schema.Struct({
      ...Slot,
      result: Schema.Literals(["safe", "unsafe", "unknown"]),
    }),
  ).check(Schema.isLengthBetween(1, 21)),
});
export class MealGenerationFailure extends Schema.TaggedError<MealGenerationFailure>()(
  "MealGenerationFailure",
  {
    reason: Schema.Literals([
      "unavailable",
      "incomplete_preferences",
      "no_suitable_meals",
      "week_full",
    ]),
  },
) {}
export type PlanningGenerationInput = typeof PlanningGenerationInput.Type;
export type GeneratedChoices = typeof GeneratedChoices.Type;
