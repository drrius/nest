import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { Card, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { MealRemovalRuntime, RemovalView } from "./removal-runtime";
export function MealRemovalForm({
  runtime,
  view,
}: {
  runtime: MealRemovalRuntime;
  view: RemovalView;
}) {
  const navigation = useNavigation();
  usePreventRemove(view.pendingWrite, ({ data }) => {
    Alert.alert(
      "Leave this removal?",
      "The removal may already have happened. Leaving loses its retry details. Check the current week before making another change.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
  if (view.stage === "verify") return null;
  const meal = view.snapshot?.entries.find((entry) => entry.entryId === runtime.target.entryId);
  return (
    <Card>
      {meal ? (
        <Note>
          {meal.date} · {meal.slot ?? "Meal"} · {meal.title}
        </Note>
      ) : null}
      {view.receipt ? (
        <Note>Removal confirmed. The current week may include later changes by your partner.</Note>
      ) : (
        <>
          <Note>
            Remove this meal from the plan online. Its history stays saved. Any open linked
            preparation is skipped; existing groceries are kept.
          </Note>
          {!meal && view.snapshot ? <Note>This meal is no longer in this week.</Note> : null}
          <NativeAction
            label="Remove meal online"
            disabled={view.busy || view.stage !== "ready" || !meal}
            onPress={() => {
              void runtime.save();
            }}
          />
        </>
      )}
    </Card>
  );
}
