import { canLeaveRefund } from "./refund-leave";
import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import type { RefundDraft } from "./refund-draft";
import type { RefundSaveRuntime } from "./refund-save-runtime";
export function useLeaveRefund(
  initial: RefundDraft,
  read: () => RefundDraft,
  runtime: RefundSaveRuntime,
) {
  const navigation = useNavigation();
  usePreventRemove(true, ({ data }) => {
    if (canLeaveRefund(initial, read(), runtime.getSnapshot()))
      return navigation.dispatch(data.action);
    Alert.alert(
      "Leave this refund?",
      "Unsaved input will be lost. Leaving does not cancel a Save already sent; its outcome remains available for recovery.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
}
