import * as Schema from "effect/Schema";
import { MealWeekStart } from "@nest/contracts/meals";
import {
  ReviewedMealIngredient,
  AddMealIngredients,
  MealIngredientsReceipt,
  sourceKey,
} from "@nest/contracts/meal-ingredients";
import { selectedMealIngredients } from "@nest/domain/meal-ingredients";

export const IngredientChoice = Schema.Struct({
  ...ReviewedMealIngredient.fields,
  selected: Schema.Boolean,
});
export const IngredientDraft = Schema.Struct({
  weekStart: MealWeekStart,
  weekRevision: AddMealIngredients.fields.expectedRevision,
  choices: Schema.Array(IngredientChoice).check(
    Schema.isMaxLength(4200),
    Schema.makeFilter((rows) => new Set(rows.map(sourceKey)).size === rows.length),
  ),
});
export const IngredientAttempt = Schema.Struct({
  ...IngredientDraft.fields,
  sequence: Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
  ),
  pending: Schema.NullOr(AddMealIngredients),
  receipt: Schema.NullOr(MealIngredientsReceipt),
}).check(Schema.makeFilter((value) => !value.pending || matchesDraft(value, value.pending)));
export type IngredientDraft = typeof IngredientDraft.Type;
export type IngredientAttempt = typeof IngredientAttempt.Type;
export function matchesDraft(draft: IngredientDraft, command: AddMealIngredients) {
  return (
    draft.weekStart === command.weekStart &&
    draft.weekRevision === command.expectedRevision &&
    Schema.toEquivalence(AddMealIngredients)(
      { ...command, selected: selectedMealIngredients(draft.choices) },
      command,
    )
  );
}
export function matchesIngredientReceipt(
  receipt: MealIngredientsReceipt,
  command: AddMealIngredients,
) {
  return (
    receipt.operationId === command.operationId.toLowerCase() &&
    receipt.weekStart === command.weekStart &&
    receipt.weekRevision === command.expectedRevision &&
    receipt.ingredients.length === command.selected.length &&
    receipt.ingredients.every(
      (row, index) => sourceKey(row) === sourceKey(command.selected[index]!),
    )
  );
}
