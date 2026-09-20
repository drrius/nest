import { useNativeState } from "@expo/ui";
import { useState } from "react";
import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import type { FoodRuntime, FoodView } from "./runtime";
import { foodDraft, parseFoodDraft } from "./draft";
export function useFoodDraft(runtime: FoodRuntime, view: FoodView) {
  const initial = foodDraft(view.profile);
  const restrictions = useNativeState(initial.restrictions),
    dislikes = useNativeState(initial.dislikes),
    calorieGoal = useNativeState(initial.calorieGoal);
  const [portions, setPortions] = useState(initial.portions);
  const [error, setError] = useState<string | null>(null);
  const navigation = useNavigation();
  usePreventRemove(true, ({ data }) => {
    const dirty =
      restrictions.value !== initial.restrictions ||
      dislikes.value !== initial.dislikes ||
      calorieGoal.value !== initial.calorieGoal ||
      portions !== initial.portions;
    if (!dirty && !view.busy && view.stage === "form") return navigation.dispatch(data.action);
    Alert.alert(
      "Leave food preferences?",
      "Unsaved input and retry details will be lost. A save already sent may still finish. Reopening loads the saved preferences.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
  const submit = () => {
    const parsed = parseFoodDraft({
      restrictions: restrictions.value,
      dislikes: dislikes.value,
      calorieGoal: calorieGoal.value,
      portions,
    });
    if (parsed._tag === "Failure")
      return setError(
        "Use up to 32 entries in each list, one per line, with up to 120 characters each. A calorie goal is optional; enter a whole number from 1 to 20,000.",
      );
    setError(null);
    void runtime.save(parsed.value);
  };
  return { restrictions, dislikes, calorieGoal, portions, setPortions, error, submit };
}
