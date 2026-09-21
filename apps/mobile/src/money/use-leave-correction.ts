import { canLeaveCorrection } from "./correction-leave";
import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import type { CorrectionDraft } from "./correction-draft";
import type { CorrectionSaveRuntime } from "./correction-save-runtime";
export function useLeaveCorrection(
  initial: CorrectionDraft,
  read: () => CorrectionDraft,
  runtime: CorrectionSaveRuntime,
) {
  const navigation = useNavigation();
  usePreventRemove(true, ({ data }) => {
    if (canLeaveCorrection(initial, read(), runtime.getSnapshot()))
      return navigation.dispatch(data.action);
    Alert.alert(
      "Leave this correction?",
      "Unsaved input will be lost. Leaving does not cancel a Save already sent; its outcome remains available for recovery.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
}
