import type { Routine } from "@nest/contracts/routines";
import { routineEditPatch, scheduleDraft } from "./edit-draft";
import { useNativeState } from "@expo/ui";
import { useState } from "react";
import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { householdDate } from "@nest/domain/calendar";
import type { RoutineRuntime, RoutineView } from "./runtime";
import { initialSchedule, parseRoutineDraft } from "./draft";
export function useRoutineDraft(runtime: RoutineRuntime, view: RoutineView, routine?: Routine) {
  const title = useNativeState(routine?.definition.title ?? "");
  const [schedule, setSchedule] = useState(() =>
    routine
      ? scheduleDraft(routine.definition.schedule, householdDate(new Date()))
      : initialSchedule(householdDate(new Date())),
  );
  const every = useNativeState(schedule.every);
  const [policy, setPolicy] = useState<"shared" | "assigned" | "alternating">(
    routine?.definition.assignment.policy ?? "shared",
  );
  const [member, setMember] = useState(() => initialMember(view, routine));
  const [error, setError] = useState<string | null>(null);
  const navigation = useNavigation();
  usePreventRemove(true, ({ data }) => {
    Alert.alert(
      "Leave routine changes?",
      "Your draft and retry details will be lost. A change already sent may still finish. Check the routine list before sending it again.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
  const submit = () => {
    if (routine) {
      const assignment =
        policy === "shared"
          ? { policy }
          : policy === "assigned"
            ? { policy, memberId: member }
            : { policy, anchorMemberId: member };
      const edited = routineEditPatch(
        routine.definition,
        title.value,
        { ...schedule, every: every.value },
        assignment,
      );
      if (edited.status !== "changed")
        return setError(
          edited.status === "unchanged"
            ? "No changes to save."
            : "Check the title, schedule and responsibility.",
        );
      setError(null);
      void runtime.edit(routine, edited.patch);
      return;
    }
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

function initialMember(view: RoutineView, routine?: Routine) {
  const assignment = routine?.definition.assignment;
  return assignment?.policy === "assigned"
    ? assignment.memberId
    : assignment?.policy === "alternating"
      ? assignment.anchorMemberId
      : (view.snapshot?.members[0]?.actorId ?? "");
}
