import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import type { LegacyConfirmationSaveRuntime } from "./legacy-confirmation-save-runtime";
export function useLeaveLegacyConfirmation(
  runtime: LegacyConfirmationSaveRuntime,
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
      "Leave draft confirmation?",
      "Unsaved edits will be lost. Leaving does not cancel a sent request; reopen draft confirmation to recover its result.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
}
