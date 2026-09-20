import { addDays, isoWeekday } from "./routines/dates.ts";
import { asIsoDate } from "./routines/types.ts";

/** Civil dates only: device timezone and DST never change a meal's day. */
export function mealWeek(date: string): readonly string[] {
  const day = asIsoDate(date);
  const monday = addDays(day, 1 - isoWeekday(day));
  return Array.from({ length: 7 }, (_, offset) => addDays(monday, offset));
}

/** A full seven-day board must fit in the shared 0001–9999 date range. */
export function adjacentMealWeek(monday: string, direction: -1 | 1): readonly string[] {
  const week = mealWeek(monday);
  if (week[0] !== monday) throw new Error("Expected a Monday week date");
  if (direction !== -1 && direction !== 1) throw new Error("Expected previous or next week");
  return mealWeek(addDays(asIsoDate(monday), direction * 7));
}
