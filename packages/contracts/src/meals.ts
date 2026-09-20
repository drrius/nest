import * as Schema from "effect/Schema";
import { CalendarDate } from "./chores.ts";
import { MealSlot } from "./cooking.ts";
import { Revision } from "./revision.ts";

const Uuid = Schema.String.check(Schema.isUUID());
export const MealWeekStart = CalendarDate.check(
  Schema.makeFilter(
    (value: string) =>
      new Date(`${value}T00:00:00.000Z`).getUTCDay() === 1 && value <= "9999-12-20",
  ),
);
export const MealWeekBaseline = Schema.Struct({
  weekStart: MealWeekStart,
  revision: Revision,
});
export type MealWeekBaseline = typeof MealWeekBaseline.Type;

// Read stored Unicode code points without shortening legacy notes or links.
// Links are data; the native opener must separately allow only HTTP(S).
const StoredText = (maximum: number) =>
  Schema.String.check(
    Schema.isMaxLength(maximum * 2),
    Schema.makeFilter(
      (value: string) =>
        Array.from(value).length <= maximum &&
        !value.includes("\u0000") &&
        !/[\uD800-\uDFFF]/u.test(value),
    ),
  );
const StoredTitle = Schema.String.check(
  Schema.makeFilter(
    (value: string) =>
      value.replace(/^ +| +$/g, "").length > 0 &&
      Array.from(value.replace(/^ +| +$/g, "")).length <= 120 &&
      !value.includes("\u0000") &&
      !/[\uD800-\uDFFF]/u.test(value),
  ),
);
export const PlannedMeal = Schema.Struct({
  entryId: Uuid,
  date: CalendarDate,
  slot: MealSlot,
  title: StoredTitle,
  recipeUrl: Schema.NullOr(StoredText(2000)),
  notes: Schema.NullOr(StoredText(4000)),
  definitionId: Schema.NullOr(Uuid),
  leftoverSourceId: Schema.NullOr(Uuid),
}).check(Schema.makeFilter((entry) => entry.leftoverSourceId !== entry.entryId));
export type PlannedMeal = typeof PlannedMeal.Type;
export const MealWeekSnapshot = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  ...MealWeekBaseline.fields,
  entries: Schema.Array(PlannedMeal).check(Schema.isMaxLength(21)),
}).check(
  Schema.makeFilter((week) => {
    const start = new Date(`${week.weekStart}T00:00:00.000Z`).getTime();
    const end = new Date(start + 6 * 86400000).toISOString().slice(0, 10);
    return (
      week.entries.every((entry) => entry.date >= week.weekStart && entry.date <= end) &&
      new Set(week.entries.map((entry) => entry.entryId)).size === week.entries.length &&
      new Set(week.entries.map((entry) => `${entry.date}:${entry.slot}`)).size ===
        week.entries.length
    );
  }),
);
export type MealWeekSnapshot = typeof MealWeekSnapshot.Type;
