import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import type { MealWeekSnapshot } from "@nest/contracts/meals";
import { mealWeek, adjacentMealWeek } from "@nest/domain/meal-week";
import { Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { space, useQuiet } from "../theme";
const slots = ["breakfast", "lunch", "dinner"] as const;
const names = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
const dayLabel = new Intl.DateTimeFormat("en", {
  weekday: "long",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
export function adjacentWeek(weekStart: string, direction: -1 | 1) {
  try {
    return adjacentMealWeek(weekStart, direction)[0]!;
  } catch {
    return null;
  }
}
export function WeekNavigation({
  weekStart,
  select,
}: {
  weekStart: string;
  select: (week: string) => void;
}) {
  const previous = adjacentWeek(weekStart, -1),
    next = adjacentWeek(weekStart, 1);
  return (
    <View style={{ gap: space.small }}>
      <Note>Week of {dayLabel.format(new Date(`${weekStart}T00:00:00Z`))}</Note>
      <NativeAction
        label="Previous week"
        disabled={!previous}
        onPress={() => {
          if (previous) select(previous);
        }}
      />
      <NativeAction
        label="Next week"
        disabled={!next}
        onPress={() => {
          if (next) select(next);
        }}
      />
    </View>
  );
}
export function MealWeekBoard({
  snapshot,
  visibleSlots,
  canAdd,
}: {
  canAdd: boolean;
  snapshot: MealWeekSnapshot;
  visibleSlots: readonly (typeof slots)[number][];
}) {
  const colors = useQuiet(),
    router = useRouter();
  return (
    <>
      {mealWeek(snapshot.weekStart).map((date) => (
        <Section key={date} title={dayLabel.format(new Date(`${date}T00:00:00Z`))}>
          {visibleSlots.map((slot) => {
            const meal = snapshot.entries.find(
              (entry) => entry.date === date && entry.slot === slot,
            );
            return (
              <Card key={slot}>
                <Note>
                  {names[slot]}
                  {meal?.leftoverSourceId ? " · Leftovers" : ""}
                </Note>
                <Text selectable style={{ color: colors.text, fontSize: 19, fontWeight: "500" }}>
                  {meal?.title ?? "No meal planned"}
                </Text>
                {meal?.notes ? <Note>{meal.notes}</Note> : null}
                {meal ? (
                  <>
                    <NativeAction
                      label="Move meal"
                      disabled={!canAdd}
                      onPress={() =>
                        router.push({
                          pathname: "/meal-move",
                          params: { sourceWeekStart: snapshot.weekStart, entryId: meal.entryId },
                        })
                      }
                    />
                    <NativeAction
                      label="Remove meal"
                      disabled={!canAdd}
                      onPress={() =>
                        router.push({
                          pathname: "/meal-remove",
                          params: { weekStart: snapshot.weekStart, entryId: meal.entryId },
                        })
                      }
                    />
                  </>
                ) : null}
                {!meal ? (
                  <NativeAction
                    label={`Add ${names[slot].toLowerCase()}`}
                    disabled={!canAdd}
                    onPress={() =>
                      router.push({
                        pathname: "/meal-add",
                        params: { weekStart: snapshot.weekStart, date, slot },
                      })
                    }
                  />
                ) : null}
              </Card>
            );
          })}
        </Section>
      ))}
    </>
  );
}
