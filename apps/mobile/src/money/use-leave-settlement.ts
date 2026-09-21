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
    const current = read();
    if (
      runtime.getSnapshot().result?.status === "recorded" ||
      Object.keys(initial).every(
        (key) => current[key as keyof SettlementDraft] === initial[key as keyof SettlementDraft],
      )
    )
      return navigation.dispatch(data.action);
    Alert.alert(
      "Leave this settlement?",
      "Unsaved input will be lost. Any Save already sent is retained for recovery.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
}
