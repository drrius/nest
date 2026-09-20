import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";

export function usePendingRoutineNavigation(pending: boolean) {
  const navigation = useNavigation();
  usePreventRemove(pending, ({ data }) => {
    Alert.alert(
      "Leave before confirmation?",
      "This change may still finish. Leaving loses its retry details. Check the current routine before making another change.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
}
