import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import type { VariableAmountDraft } from "./recurring-variable-draft";
import type { VariableCycleSaveRuntime } from "./recurring-variable-save-runtime";
import { variableLeavePolicy } from "./variable-leave-policy";
export function useLeaveVariable(read: () => VariableAmountDraft, save: VariableCycleSaveRuntime) {
  const navigation = useNavigation();
  usePreventRemove(true, ({ data }) => {
    const policy = variableLeavePolicy(read(), save.getSnapshot());
    if (policy === "quiet") return navigation.dispatch(data.action);
    Alert.alert(
      "Leave this variable bill?",
      policy === "pending"
        ? "This financial request may already be recorded. Leaving does not cancel it. Reopen a variable bill to check the saved request before recording another. Unsaved input will be lost."
        : "Your unsaved amount and split will be lost. Leaving does not cancel any request already sent.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
}
