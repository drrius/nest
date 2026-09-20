import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
export function useChoreChangeNavigation(editing: boolean, pending: boolean) {
  const navigation = useNavigation();
  usePreventRemove(editing || pending, ({ data }) => {
    Alert.alert(
      pending ? "Leave before confirmation?" : "Discard this chore change?",
      pending
        ? "The change may still finish. Leaving loses its retry details. Check the current chore before changing it again."
        : "Your unsaved choice will be lost.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
}
