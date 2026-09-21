import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
export function useLeavePendingApproval(runtime: {
  getSnapshot: () => { busy: boolean; attempt: object | null };
}) {
  const navigation = useNavigation();
  usePreventRemove(true, ({ data }) => {
    const view = runtime.getSnapshot();
    if (!view.busy && !view.attempt) return navigation.dispatch(data.action);
    Alert.alert(
      "Leave this private proposal?",
      "A decision may already be recorded. Leaving does not cancel it. Reopen this proposal to check the saved decision before making another.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
}
