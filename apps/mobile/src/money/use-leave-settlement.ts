import { canLeaveSettlement } from "./settlement-leave";
import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import type { SettlementDraft } from "./settlement-draft";
import type { SettlementSaveRuntime } from "./settlement-save-runtime";
export function useLeaveSettlement(
  initial: SettlementDraft,
  read: () => SettlementDraft,
  runtime: SettlementSaveRuntime,
) {
  const navigation = useNavigation();
  usePreventRemove(true, ({ data }) => {
    if (canLeaveSettlement(initial, read(), runtime.getSnapshot()))
      return navigation.dispatch(data.action);
    Alert.alert(
      "Leave this settlement?",
      "Unsaved input will be lost. Leaving does not cancel a Save already sent; its outcome remains available for recovery.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
}
