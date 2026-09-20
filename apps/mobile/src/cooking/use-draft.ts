import { useNativeState } from "@expo/ui";
import { useState } from "react";
import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import * as Schema from "effect/Schema";
import { CookingPreferences, type MealSlot } from "@nest/contracts/cooking";
import type { CookingRuntime, CookingView } from "./runtime";
export const mealSlots = ["breakfast", "lunch", "dinner"] as const;
export function useCookingDraft(runtime: CookingRuntime, view: CookingView) {
  const initialNotes = view.profile?.preferences.cookingNotes ?? "";
  const initialSlots = view.profile?.preferences.mealSlots ?? mealSlots;
  const notes = useNativeState(initialNotes);
  const [slots, setSlots] = useState<readonly (typeof MealSlot.Type)[]>(initialSlots);
  const [error, setError] = useState<string | null>(null);
  const navigation = useNavigation();
  usePreventRemove(true, ({ data }) => {
    const dirty =
      notes.value !== initialNotes ||
      mealSlots.some((slot) => slots.includes(slot) !== initialSlots.includes(slot));
    if (!dirty && !view.busy && view.stage === "form") return navigation.dispatch(data.action);
    Alert.alert(
      "Leave cooking preferences?",
      "Unsaved input and retry details will be lost. A save already sent may still finish. Reopening loads the shared saved preferences.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
  const toggle = (slot: typeof MealSlot.Type, checked: boolean) =>
    setSlots((previous) =>
      mealSlots.filter((value) => (value === slot ? checked : previous.includes(value))),
    );
  const submit = () => {
    const parsed = Schema.decodeUnknownExit(CookingPreferences)({
      cookingNotes: notes.value.trim(),
      mealSlots: slots,
    });
    if (parsed._tag === "Failure")
      return setError(
        "Choose at least one meal slot. Cooking notes can have up to 2,000 characters.",
      );
    setError(null);
    void runtime.save(parsed.value);
  };
  return { notes, slots, toggle, error, submit };
}
