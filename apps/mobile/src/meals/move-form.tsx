import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { mealWeek } from "@nest/domain/meal-week";
import { Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { WeekNavigation } from "./board";
import type { MealMoveRuntime, MoveView } from "./move-runtime";
const slots = ["breakfast", "lunch", "dinner"] as const;
export function MealMoveForm({ runtime, view }: { runtime: MealMoveRuntime; view: MoveView }) {
  const navigation = useNavigation();
  usePreventRemove(view.pendingWrite, ({ data }) => {
    Alert.alert(
      "Leave this move?",
      "The meal may already have moved. Leaving loses its retry details. Check both weeks before making another change.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
  if (view.stage === "verify") return null;
  const meal = view.source?.entries.find((entry) => entry.entryId === runtime.target.entryId);
  return (
    <>
      <Card>
        {meal ? (
          <Note>
            {meal.title} · {meal.date} · {meal.slot}
          </Note>
        ) : null}
        {view.receipt ? (
          <Note>Move confirmed. Your partner may have changed the plan since then.</Note>
        ) : (
          <>
            <Note>
              Choose an empty slot to move this meal online. Ingredients, instructions and groceries
              stay the same. Any linked preparation keeps its existing date.
            </Note>
            {!meal && view.source ? (
              <Note>This meal is no longer in its original week.</Note>
            ) : null}
          </>
        )}
      </Card>
      <DestinationWeek runtime={runtime} view={view} />
      {meal && !view.receipt ? <Destinations runtime={runtime} view={view} /> : null}
    </>
  );
}
function Destinations({ runtime, view }: { runtime: MealMoveRuntime; view: MoveView }) {
  if (!view.destination) return null;
  const week = view.destination;
  return (
    <>
      {mealWeek(week.weekStart).map((date) => (
        <Section key={date} title={date}>
          {slots.map((slot) => {
            const occupied = week.entries.find(
              (entry) => entry.date === date && entry.slot === slot,
            );
            return (
              <NativeAction
                key={slot}
                label={occupied ? `${slot}: ${occupied.title}` : `Move to ${date} · ${slot}`}
                disabled={view.busy || view.stage !== "ready" || !!occupied}
                onPress={() => {
                  void runtime.save({ date, slot });
                }}
              />
            );
          })}
        </Section>
      ))}
    </>
  );
}

function DestinationWeek({ runtime, view }: { runtime: MealMoveRuntime; view: MoveView }) {
  if (view.receipt || view.pendingWrite || view.busy) return null;
  return (
    <WeekNavigation
      weekStart={view.targetWeekStart}
      select={(week) => {
        void runtime.selectWeek(week);
      }}
    />
  );
}
