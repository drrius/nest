import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import type { MealReminderSaveRuntime } from "./save-runtime";
export function useLeaveReminder(
  runtime: MealReminderSaveRuntime,
  dirty: () => boolean,
  invalidate: () => void,
) {
  const navigation = useNavigation();
  usePreventRemove(true, ({ data }) => {
    invalidate();
    const view = runtime.getSnapshot();
    if (view.result?.status === "recorded" || (!view.busy && !view.attempt && !dirty()))
      return navigation.dispatch(data.action);
    Alert.alert(
      "Leave reminder editor?",
      "Unsaved edits will be lost. Leaving does not cancel a sent change. Reopen the editor to check its outcome.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
}
