import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import type { MealWeekSnapshot } from "@nest/contracts/meals";
import { mealWeek, adjacentMealWeek } from "@nest/domain/meal-week";
import { space, useQuiet } from "../theme";
import { MealActions } from "./meal-actions";
const slots = ["breakfast", "lunch", "dinner"] as const;
const names = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
const shortDay = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" });
const dayLabel = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone: "UTC" });
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
  const colors = useQuiet(),
    previous = adjacentWeek(weekStart, -1),
    next = adjacentWeek(weekStart, 1);
  const dates = mealWeek(weekStart);
  const range = `${dayLabel.format(new Date(`${weekStart}T12:00:00Z`))} – ${dayLabel.format(new Date(`${dates[6]}T12:00:00Z`))}`;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.small }}>
      <WeekArrow label="Previous week" glyph="‹" date={previous} select={select} />
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={1.6}
        style={{
          flex: 1,
          textAlign: "center",
          color: colors.text,
          fontSize: 17,
          fontWeight: "600",
        }}
      >
        {range}
      </Text>
      <WeekArrow label="Next week" glyph="›" date={next} select={select} />
    </View>
  );
}
function WeekArrow({
  label,
  glyph,
  date,
  select,
}: {
  label: string;
  glyph: string;
  date: string | null;
  select: (date: string) => void;
}) {
  const colors = useQuiet();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !date }}
      disabled={!date}
      onPress={() => {
        if (date) select(date);
      }}
      style={({ pressed }) => ({
        minWidth: 44,
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
        opacity: !date ? 0.4 : pressed ? 0.65 : 1,
      })}
    >
      <Text allowFontScaling={false} style={{ color: colors.accent, fontSize: 28 }}>
        {glyph}
      </Text>
    </Pressable>
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
  const colors = useQuiet();
  return (
    <View style={{ gap: space.small }}>
      {mealWeek(snapshot.weekStart).map((date) => (
        <View
          key={date}
          style={{
            flexDirection: "row",
            gap: space.medium,
            paddingVertical: space.medium,
            borderBottomColor: colors.border,
            borderBottomWidth: 1,
          }}
        >
          <View style={{ minWidth: 42, alignItems: "center", gap: 4, paddingTop: space.small }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {shortDay.format(new Date(`${date}T12:00:00Z`)).toUpperCase()}
            </Text>
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: "600" }}>
              {Number(date.slice(-2))}
            </Text>
          </View>
          <View style={{ flex: 1, gap: space.small }}>
            {visibleSlots.map((slot) => (
              <MealSlot key={slot} date={date} slot={slot} snapshot={snapshot} canAdd={canAdd} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
function MealSlot({
  date,
  slot,
  snapshot,
  canAdd,
}: {
  date: string;
  slot: (typeof slots)[number];
  snapshot: MealWeekSnapshot;
  canAdd: boolean;
}) {
  const router = useRouter();
  const meal = snapshot.entries.find((entry) => entry.date === date && entry.slot === slot);
  const disabled = !meal && !canAdd;
  const open = () =>
    meal
      ? router.push({
          pathname: "/planned-recipe",
          params: {
            weekStart: snapshot.weekStart,
            revision: snapshot.revision,
            entryId: meal.entryId,
          },
        })
      : router.push({
          pathname: "/meal-add",
          params: { weekStart: snapshot.weekStart, date, slot },
        });
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.small }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${date}, ${names[slot]}: ${meal?.title ?? "Add meal"}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={open}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 64,
          justifyContent: "center",
          gap: 4,
          opacity: mealRowOpacity(disabled, pressed),
        })}
      >
        <MealLabel meal={meal} slot={slot} />
      </Pressable>
      {meal ? <MealActions meal={meal} weekStart={snapshot.weekStart} enabled={canAdd} /> : null}
    </View>
  );
}

function mealRowOpacity(disabled: boolean, pressed: boolean) {
  if (disabled) return 0.5;
  return pressed ? 0.65 : 1;
}

function MealLabel({
  meal,
  slot,
}: {
  meal: MealWeekSnapshot["entries"][number] | undefined;
  slot: (typeof slots)[number];
}) {
  const colors = useQuiet();
  return (
    <>
      <Text style={{ color: colors.muted, fontSize: 14 }}>
        {names[slot]}
        {meal?.leftoverSourceId ? " · Leftovers" : ""}
      </Text>
      <Text style={{ color: meal ? colors.text : colors.accent, fontSize: 18, fontWeight: "500" }}>
        {meal?.title ?? `Add ${names[slot].toLowerCase()}`}
      </Text>
      {meal?.notes ? (
        <Text style={{ color: colors.muted, fontSize: 14 }} numberOfLines={2}>
          {meal.notes}
        </Text>
      ) : null}
    </>
  );
}
