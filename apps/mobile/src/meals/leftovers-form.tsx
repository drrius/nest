import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { mealWeek } from "@nest/domain/meal-week";
import { Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { WeekNavigation } from "./board";
import type { MealLeftoversRuntime, LeftoversView } from "./leftovers-runtime";
const slots = ["breakfast", "lunch", "dinner"] as const;
export function MealLeftoversForm({
  runtime,
  view,
}: {
  runtime: MealLeftoversRuntime;
  view: LeftoversView;
}) {
  const navigation = useNavigation();
  usePreventRemove(view.pendingWrite, ({ data }) => {
    Alert.alert(
      "Leave these leftovers?",
      "The leftovers may already have been saved. Leaving loses its retry details. Check both weeks before making another change.",
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
          <Note>Leftovers confirmed. Your partner may have changed the plan since then.</Note>
        ) : (
          <>
            <Note>
              Choose an empty slot on a later day. Leftovers keep the source meal’s saved recipe. No
              groceries or preparation tasks are added.
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
function Destinations({ runtime, view }: { runtime: MealLeftoversRuntime; view: LeftoversView }) {
  if (!view.destination) return null;
  const week = view.destination;
  const source = view.source?.entries.find((entry) => entry.entryId === runtime.target.entryId);
  if (!source) return null;
  if (source.leftoverSourceId) return <Note>Choose an original meal to plan leftovers.</Note>;
  const dates = mealWeek(week.weekStart).filter((date) => date > source.date);
  if (!dates.length) return <Note>Choose a later week to plan leftovers after this meal.</Note>;
  return (
    <>
      {dates.map((date) => (
        <Section key={date} title={date}>
          {slots.map((slot) => {
            const occupied = week.entries.find(
              (entry) => entry.date === date && entry.slot === slot,
            );
            return (
              <NativeAction
                key={slot}
                label={
                  occupied ? `${slot}: ${occupied.title}` : `Plan leftovers: ${date} · ${slot}`
                }
                disabled={view.busy || view.stage !== "ready" || !!occupied}
                onPress={() => {
                  Alert.alert("Plan leftovers?", `${source.title} · ${date} · ${slot}`, [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Plan leftovers",
                      onPress: () => {
                        void runtime.save({ date, slot });
                      },
                    },
                  ]);
                }}
              />
            );
          })}
        </Section>
      ))}
    </>
  );
}

function DestinationWeek({
  runtime,
  view,
}: {
  runtime: MealLeftoversRuntime;
  view: LeftoversView;
}) {
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
