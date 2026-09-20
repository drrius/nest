import { useNativeState } from "@expo/ui";
import { useState } from "react";
import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { householdDate } from "@nest/domain/calendar";
import type { RoutineRuntime, RoutineView } from "./runtime";
import { initialSchedule, parseRoutineDraft } from "./draft";
export function useRoutineDraft(runtime: RoutineRuntime, view: RoutineView) {
  const title = useNativeState("");
  const every = useNativeState("1");
  const [schedule, setSchedule] = useState(() => initialSchedule(householdDate(new Date())));
  const [policy, setPolicy] = useState<"shared" | "assigned" | "alternating">("shared");
  const [member, setMember] = useState(view.snapshot?.members[0]?.actorId ?? "");
  const [error, setError] = useState<string | null>(null);
  const navigation = useNavigation();
  usePreventRemove(true, ({ data }) => {
    Alert.alert(
      "Leave routine creation?",
      "Your draft and retry details will be lost. A create already sent may still finish. Check the routine list before creating it again.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
  const submit = () => {
    const result = parseRoutineDraft(
      title.value,
      { ...schedule, every: every.value },
      policy,
      member,
    );
    if (result._tag === "Failure")
      return setError(
        "Enter a title and valid schedule. Select at least one day or enter a positive whole-number interval.",
      );
    setError(null);
    void runtime.create(result.value);
  };
  return {
    title,
    every,
    schedule,
    setSchedule,
    policy,
    setPolicy,
    member,
    setMember,
    error,
    submit,
  };
}
