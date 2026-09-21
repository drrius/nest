import { householdDayWindow } from "@nest/domain/calendar";
import { mealWeek } from "@nest/domain/meal-week";
import { assessAvailability } from "@nest/domain/availability";
import { MealGenerationFailure, type PlanningGenerationInput } from "./generation-schema.ts";
export const slotKey = (value: { date: string; slot: string }) => `${value.date}:${value.slot}`;
export function prepareGeneration(input: PlanningGenerationInput, now: number) {
  const { context, week } = input;
  if (!context.cooking || context.members.some((member) => member.profile === null))
    throw new MealGenerationFailure({ reason: "incomplete_preferences" });
  const members = context.members.map((member) => {
    if (!member.profile) throw new MealGenerationFailure({ reason: "incomplete_preferences" });
    const { restrictions, dislikes, portions } = member.profile;
    return { restrictions, dislikes, portions };
  });
  const days = mealWeek(week.weekStart),
    occupied = new Set(week.entries.map(slotKey));
  const slots = days
    .flatMap((date) => context.cooking!.preferences.mealSlots.map((slot) => ({ date, slot })))
    .filter((slot) => !occupied.has(slotKey(slot)));
  if (!slots.length) throw new MealGenerationFailure({ reason: "week_full" });
  if (input.familiarOnly && !input.library.recipes.length)
    throw new MealGenerationFailure({ reason: "no_suitable_meals" });
  return {
    slots,
    members,
    cooking: context.cooking.preferences,
    requesterCalorieGoal: context.requesterCalorieGoal,
    familiarOnly: input.familiarOnly,
    savedRecipes: input.library.recipes,
    availability: days.map((date) => ({
      date,
      members: context.members.map((member) => {
        const snapshot = input.busy.snapshots.find(
          (row) => row.actorId.toLowerCase() === member.actorId.toLowerCase(),
        );
        return assessAvailability(
          snapshot
            ? {
                covered: snapshot.covered,
                intervals: snapshot.intervals,
                capturedAt: Date.parse(snapshot.capturedAt),
                expiresAt: Date.parse(snapshot.expiresAt),
              }
            : null,
          householdDayWindow(date),
          now,
        );
      }),
    })),
  };
}
export type PreparedGeneration = ReturnType<typeof prepareGeneration>;
