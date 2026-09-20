import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
export function useChoreChangeNavigation(editing: boolean, pending: boolean) {
  const navigation = useNavigation();
  usePreventRemove(editing || pending, ({ data }) => {
    Alert.alert(
      pending ? "Leave before confirmation?" : "Discard this chore change?",
      pending
        ? "The change may still finish. Its retry details are not saved across app restarts or sign-out. You can return here to retry while this account remains open."
        : "Your unsaved choice will be lost.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
}
