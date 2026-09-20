import * as Schema from "effect/Schema";
import { CalendarDate } from "./chores.ts";
import { MealSlot } from "./cooking.ts";
import { MealWeekStart } from "./meals.ts";
import { Revision } from "./revision.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const destinationInWeek = (value: { targetWeekStart: string; date: string }) => {
  const start = new Date(`${value.targetWeekStart}T00:00:00.000Z`).getTime();
  const end = new Date(start + 6 * 86400000).toISOString().slice(0, 10);
  return value.date >= value.targetWeekStart && value.date <= end;
};
const sameWeekBaseline = (value: {
  sourceWeekStart: string;
  targetWeekStart: string;
  expectedSourceRevision: string;
  expectedTargetRevision: string;
}) =>
  value.sourceWeekStart !== value.targetWeekStart ||
  value.expectedSourceRevision === value.expectedTargetRevision;
export const MoveMealInput = Schema.Struct({
  entryId: Uuid,
  sourceWeekStart: MealWeekStart,
  expectedSourceRevision: Revision,
  targetWeekStart: MealWeekStart,
  expectedTargetRevision: Revision,
  date: CalendarDate,
  slot: MealSlot,
}).check(Schema.makeFilter(destinationInWeek), Schema.makeFilter(sameWeekBaseline));
export type MoveMealInput = typeof MoveMealInput.Type;
export const MoveMeal = Schema.Struct({ operationId: Uuid, ...MoveMealInput.fields }).check(
  Schema.makeFilter(destinationInWeek),
  Schema.makeFilter(sameWeekBaseline),
);
export type MoveMeal = typeof MoveMeal.Type;
export const MealMoveReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  entryId: Uuid,
  sourceWeekStart: MealWeekStart,
  targetWeekStart: MealWeekStart,
  sourceRevision: Revision,
  targetRevision: Revision,
  date: CalendarDate,
  slot: MealSlot,
}).check(
  Schema.makeFilter(destinationInWeek),
  Schema.makeFilter(
    (value) =>
      value.sourceRevision !== "0" &&
      value.targetRevision !== "0" &&
      (value.sourceWeekStart !== value.targetWeekStart ||
        value.sourceRevision === value.targetRevision),
  ),
);
export type MealMoveReceipt = typeof MealMoveReceipt.Type;
