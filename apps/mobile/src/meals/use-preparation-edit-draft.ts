import { useNativeState } from "@expo/ui";
import { useCalendarDateCheck } from "../calendar/use-date-check";
import { useState } from "react";
import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import type { MealPreparationEditRuntime, PreparationEditView } from "./preparation-edit-runtime";
import {
  preparationEditValues,
  preparationEditDirty,
  preparationEditPatch,
} from "./preparation-edit-draft";
const messages = {
  unchanged: "No changes to save.",
  finished: "Finished preparation keeps its date and responsibility.",
  invalid: "Check the title, instructions, date and responsibility.",
};
export function usePreparationEditDraft(
  runtime: MealPreparationEditRuntime,
  view: PreparationEditView,
) {
  const calendar = useCalendarDateCheck("preparation");
  const [task] = useState(view.snapshot!.preparation!);
  const [initial] = useState(() => preparationEditValues(task));
  const title = useNativeState(initial.title),
    instructions = useNativeState(initial.instructions);
  const [dueOn, setDueOn] = useState(initial.dueOn);
  const [policy, setPolicy] = useState(initial.policy);
  const [member, setMember] = useState(initial.member || view.members[0]?.actorId || "");
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
    if (view.receipt || (!view.pendingWrite && !preparationEditDirty(task, value()))) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert(
      "Leave preparation edits?",
      "Your draft and retry details will be lost. An edit already sent may still finish. Reopen preparation before trying again.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
  const reload = () => {
    if (view.busy || view.pendingWrite || calendar.checking) return;
    confirmReload(runtime, preparationEditDirty(task, value()));
  };
  const submit = () => {
    const result = preparationEditPatch(task, value());
    if (result.status !== "changed") {
      setError(messages[result.status]);
      return;
    }
    setError(null);
    const save = () => {
      void runtime.save(result.patch);
    };
    if (result.patch.dueOn) void calendar.check(result.patch.dueOn, save);
    else save();
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
    reload,
  };
}

function confirmReload(runtime: MealPreparationEditRuntime, dirty: boolean) {
  if (!dirty) {
    void runtime.load();
    return;
  }
  Alert.alert(
    "Discard this draft?",
    "Reloading replaces your draft with the current preparation.",
    [
      { text: "Keep draft", style: "cancel" },
      {
        text: "Reload",
        style: "destructive",
        onPress: () => {
          void runtime.load();
        },
      },
    ],
  );
}
