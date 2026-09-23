import { Link } from "expo-router";
import type { MealWeekSnapshot } from "@nest/contracts/meals";
import { Card, Note } from "../components/page";
import { useQuiet } from "../theme";
const slots = ["breakfast", "lunch", "dinner"] as const;
const names = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
/** Today lists actual scheduled meals without empty-slot placeholders. */
export function TodayMealRows({ snapshot, date }: { snapshot: MealWeekSnapshot; date: string }) {
  const colors = useQuiet();
  const entries = slots.flatMap((slot) =>
    snapshot.entries.filter((meal) => meal.date === date && meal.slot === slot),
  );
  if (!entries.length) return <Note>No meals planned for today.</Note>;
  return (
    <>
      {entries.map((meal) => (
        <Card key={meal.entryId}>
          <Note>
            {names[meal.slot]}
            {meal.leftoverSourceId ? " · Leftovers" : ""}
          </Note>
          <Link
            href={{
              pathname: "/planned-recipe",
              params: {
                entryId: meal.entryId,
                weekStart: snapshot.weekStart,
                revision: snapshot.revision,
              },
            }}
            style={{ color: colors.text, fontSize: 19, paddingVertical: 12 }}
          >
            {meal.title}
          </Link>
        </Card>
      ))}
    </>
  );
}
