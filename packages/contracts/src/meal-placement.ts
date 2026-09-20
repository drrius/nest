import * as Schema from "effect/Schema";
import { CalendarDate } from "./chores.ts";
import { MealSlot } from "./cooking.ts";
import { MealWeekStart } from "./meals.ts";
import { Revision } from "./revision.ts";

const Uuid = Schema.String.check(Schema.isUUID());
const Title = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(120),
  Schema.makeFilter(
    (value: string) =>
      value.trim().length > 0 && !value.includes("\u0000") && !/[\uD800-\uDFFF]/u.test(value),
  ),
);
const inWeek = (value: { weekStart: string; date: string }) => {
  const start = new Date(`${value.weekStart}T00:00:00.000Z`).getTime();
  const end = new Date(start + 6 * 86400000).toISOString().slice(0, 10);
  return value.date >= value.weekStart && value.date <= end;
};
export const PlaceMealInput = Schema.Struct({
  weekStart: MealWeekStart,
  expectedRevision: Revision,
  date: CalendarDate,
  slot: MealSlot,
  title: Title,
}).check(Schema.makeFilter(inWeek));
export type PlaceMealInput = typeof PlaceMealInput.Type;
export const PlaceMeal = Schema.Struct({
  operationId: Uuid,
  ...PlaceMealInput.fields,
}).check(Schema.makeFilter(inWeek));
export type PlaceMeal = typeof PlaceMeal.Type;
export const MealPlacementReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  entryId: Uuid,
  weekStart: MealWeekStart,
  date: CalendarDate,
  slot: MealSlot,
  revision: Revision,
}).check(
  Schema.makeFilter(inWeek),
  Schema.makeFilter((value) => value.revision !== "0"),
);
export type MealPlacementReceipt = typeof MealPlacementReceipt.Type;
