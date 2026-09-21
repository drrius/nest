import * as Schema from "effect/Schema";
import {
  CreateMealPreparationInput,
  MealPreparationDraft,
  MealPreparationReceipt,
} from "./meal-preparation.ts";
import { RoutineVersion } from "./routines.ts";
import { RemoveMealInput } from "./meal-removal.ts";
export const MealPreparationPatch = Schema.Struct({
  title: Schema.optional(MealPreparationDraft.fields.title),
  instructions: Schema.optional(MealPreparationDraft.fields.instructions),
  dueOn: Schema.optional(MealPreparationDraft.fields.dueOn),
  assignment: Schema.optional(MealPreparationDraft.fields.assignment),
}).check(Schema.makeFilter((patch) => Object.keys(patch).length > 0));
export const EditMealPreparationInput = Schema.Struct({
  ...RemoveMealInput.fields,
  routineId: MealPreparationReceipt.fields.routineId,
  expectedRoutineVersion: RoutineVersion,
  patch: MealPreparationPatch,
});
export const EditMealPreparation = Schema.Struct({
  operationId: CreateMealPreparationInput.fields.entryId,
  ...EditMealPreparationInput.fields,
});
export const MealPreparationEditReceipt = Schema.Struct({
  ...MealPreparationReceipt.fields,
  previousRoutineVersion: RoutineVersion,
}).check(Schema.makeFilter((receipt) => receipt.routineVersion >= receipt.previousRoutineVersion));
export type EditMealPreparationInput = typeof EditMealPreparationInput.Type;
export type EditMealPreparation = typeof EditMealPreparation.Type;
export type MealPreparationPatch = typeof MealPreparationPatch.Type;
export type MealPreparationEditReceipt = typeof MealPreparationEditReceipt.Type;
