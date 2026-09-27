import { Link } from "expo-router";
import { Pressable, Text } from "react-native";
import type { MealWeekSnapshot } from "@nest/contracts/meals";
import { Note } from "../components/page";
import { space, useQuiet } from "../theme";
const slots = ["breakfast", "lunch", "dinner"] as const;
const names = { breakfast: "Breakfast today", lunch: "Lunch today", dinner: "Tonight’s dinner" };
/** Today lists actual scheduled meals without inventing meals or recipe metadata. */
export function TodayMealRows({ snapshot, date }: { snapshot: MealWeekSnapshot; date: string }) {
  const colors = useQuiet();
  const entries = slots.flatMap((slot) =>
    snapshot.entries.filter((meal) => meal.date === date && meal.slot === slot),
  );
  if (!entries.length) return <Note>No meals planned for today.</Note>;
  return (
    <>
      {entries.map((meal) => (
        <Link
          key={meal.entryId}
          asChild
          href={{
            pathname: "/planned-recipe",
            params: {
              entryId: meal.entryId,
              weekStart: snapshot.weekStart,
              revision: snapshot.revision,
            },
          }}
        >
          <Pressable
            accessibilityRole="link"
            style={({ pressed }) => ({
              backgroundColor: colors.soft,
              borderRadius: 24,
              borderCurve: "continuous",
              padding: space.large,
              minHeight: 120,
              gap: space.medium,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text style={{ color: colors.muted, fontSize: 15 }}>
              {names[meal.slot]}
              {meal.leftoverSourceId ? " · Leftovers" : ""}
            </Text>
            <Text style={{ color: colors.text, fontSize: 26, fontWeight: "600" }}>
              {meal.title}
            </Text>
            <Text style={{ color: colors.accent, fontSize: 15 }}>View meal →</Text>
          </Pressable>
        </Link>
      ))}
    </>
  );
}
