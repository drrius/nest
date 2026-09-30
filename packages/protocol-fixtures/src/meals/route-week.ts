import * as Schema from "effect/Schema";
import { MealWeekStart } from "@nest/contracts/meals";
import { mealWeek } from "@nest/domain/meal-week";
export function requestedMealWeek(requested: unknown, today: string) {
  return Schema.is(MealWeekStart)(requested) ? requested : mealWeek(today)[0]!;
}
