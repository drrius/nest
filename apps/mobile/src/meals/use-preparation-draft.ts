import { useNativeState } from "@expo/ui";
import { useCalendarDateCheck } from "../calendar/use-date-check";
import { useState } from "react";
import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import type { MealPreparationRuntime, PreparationView } from "./preparation-runtime";
import { parsePreparationDraft, preparationDraftDirty } from "./preparation-draft";
export function usePreparationDraft(runtime: MealPreparationRuntime, view: PreparationView) {
  const calendar = useCalendarDateCheck("preparation");
  const title = useNativeState("");
  const instructions = useNativeState("");
  const [initialDate] = useState(view.snapshot!.entry!.date);
  const [dueOn, setDueOn] = useState(initialDate);
  const [policy, setPolicy] = useState<"shared" | "assigned" | "alternating">("shared");
  const [member, setMember] = useState(view.members[0]?.actorId ?? "");
  const [error, setError] = useState<string | null>(null);
  const navigation = useNavigation();
  const value = () => ({
    title: title.value,
    instructions: instructions.value,
    dueOn,
    policy,
    member,
  });
  usePreventRemove(true, ({ data }) => {
    if (view.receipt || (!view.pendingWrite && !preparationDraftDirty(value(), initialDate))) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert(
      "Leave preparation?",
      "Your draft and retry details will be lost. A request already sent may still finish. Reopen preparation to check before creating again.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
  const submit = () => {
    const parsed = parsePreparationDraft(value());
    if (parsed._tag === "Failure") {
      setError("Enter a title, a valid due date and responsibility. Instructions are optional.");
      return;
    }
    setError(null);
    void calendar.check(parsed.value.dueOn, () => {
      void runtime.save(parsed.value);
    });
  };
  return {
    checking: calendar.checking,
    title,
    instructions,
    dueOn,
    setDueOn,
    policy,
    setPolicy,
    member,
    setMember,
    error,
    submit,
  };
}
