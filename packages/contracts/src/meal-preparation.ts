import * as Schema from "effect/Schema";
import { RemoveMealInput } from "./meal-removal.ts";
import { CalendarDate } from "./chores.ts";
import { RoutineDefinition, RoutineAssignment, RoutineVersion } from "./routines.ts";
const Uuid = RemoveMealInput.fields.entryId;
const Instructions = Schema.String.check(
  Schema.isMaxLength(4000),
  Schema.makeFilter(
    (value: string) => !value.includes("\u0000") && !/[\uD800-\uDFFF]/u.test(value),
  ),
);
export const MealPreparationDraft = Schema.Struct({
  title: RoutineDefinition.fields.title,
  instructions: Schema.NullOr(Instructions),
  dueOn: CalendarDate,
  assignment: RoutineAssignment,
});
export const CreateMealPreparationInput = Schema.Struct({
  ...RemoveMealInput.fields,
  preparation: MealPreparationDraft,
});
export const CreateMealPreparation = Schema.Struct({
  operationId: Uuid,
  ...CreateMealPreparationInput.fields,
});
// Linking preparation does not change the meal board's contents or week revision.
export const MealPreparationReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  entryId: Uuid,
  weekStart: RemoveMealInput.fields.weekStart,
  revision: RemoveMealInput.fields.expectedRevision,
  routineId: Uuid,
  occurrenceId: Uuid,
  routineVersion: RoutineVersion,
  dueOn: CalendarDate,
});
export type MealPreparationDraft = typeof MealPreparationDraft.Type;
export type CreateMealPreparationInput = typeof CreateMealPreparationInput.Type;
export type CreateMealPreparation = typeof CreateMealPreparation.Type;
export type MealPreparationReceipt = typeof MealPreparationReceipt.Type;
