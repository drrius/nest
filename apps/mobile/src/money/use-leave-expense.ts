import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import type { ExpenseDraft } from "./expense-draft";
import type { ExpenseSaveRuntime } from "./save-runtime";
export function useLeaveExpense(
  initial: ExpenseDraft,
  read: () => ExpenseDraft,
  runtime: ExpenseSaveRuntime,
) {
  const navigation = useNavigation();
  usePreventRemove(true, ({ data }) => {
    const current = read();
    if (
      runtime.getSnapshot().result?.status === "recorded" ||
      Object.keys(initial).every(
        (key) => current[key as keyof ExpenseDraft] === initial[key as keyof ExpenseDraft],
      )
    )
      return navigation.dispatch(data.action);
    Alert.alert(
      "Leave this expense?",
      "Unsaved input and the selected receipt will be lost. An upload may remain unattached. Any expense Save already sent is retained for recovery.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
}
