import * as Schema from "effect/Schema";
import { ReadPlannedRecipe } from "./recipe-selection.ts";
import { PlannedMeal, StoredMealText } from "./meals.ts";
import { RoutineAssignment, RoutineVersion, StoredRoutineDefinition } from "./routines.ts";
import { CalendarDate } from "./chores.ts";
const Uuid = ReadPlannedRecipe.fields.entryId;
export const ReadMealPreparation = ReadPlannedRecipe;
export const MealPreparation = Schema.Struct({
  routineId: Uuid,
  occurrenceId: Uuid,
  routineVersion: RoutineVersion,
  title: StoredRoutineDefinition.fields.title,
  // Legacy SQL allows 4,000 Unicode code points, rather than UTF-16 units.
  instructions: Schema.NullOr(StoredMealText(4000)),
  dueOn: CalendarDate,
  assignment: RoutineAssignment,
  plannedAssigneeId: Schema.NullOr(Uuid),
  status: Schema.Literals(["open", "completed", "skipped"]),
  state: Schema.Literals(["active", "paused", "archived"]),
});
export const MealPreparationEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  ...ReadMealPreparation.fields,
  entry: Schema.NullOr(
    Schema.Struct({ entryId: Uuid, date: CalendarDate, title: PlannedMeal.fields.title }),
  ),
  preparation: Schema.NullOr(MealPreparation),
}).check(
  Schema.makeFilter((value) => value.entry !== null || value.preparation === null),
  Schema.makeFilter((value) => value.entry === null || value.entry.entryId === value.entryId),
  Schema.makeFilter((value) => {
    if (!value.entry) return true;
    const end = new Date(new Date(`${value.weekStart}T00:00:00.000Z`).getTime() + 6 * 86400000)
      .toISOString()
      .slice(0, 10);
    return value.entry.date >= value.weekStart && value.entry.date <= end;
  }),
);
export type ReadMealPreparation = typeof ReadMealPreparation.Type;
export type MealPreparation = typeof MealPreparation.Type;
export type MealPreparationEnvelope = typeof MealPreparationEnvelope.Type;
