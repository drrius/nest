import { useRouter } from "expo-router";
import { View } from "react-native";
import { ActionMenu } from "../components/action-menu";
import { NativeAction } from "../components/native-action";
import { space } from "../theme";

export function WeekToolbar({
  weekStart,
  busy,
  refresh,
}: {
  weekStart: string;
  busy: boolean;
  refresh: () => void;
}) {
  const router = useRouter();
  return (
    <View
      style={{ flexDirection: "row", flexWrap: "wrap", gap: space.small, alignItems: "center" }}
    >
      <NativeAction
        label="Plan the week with AI"
        onPress={() => router.push({ pathname: "/meal-proposal", params: { weekStart } })}
      />
      <ActionMenu
        label="More meal planning actions"
        actions={[
          { label: "Saved meals and recipes", onPress: () => router.push("/meal-library") },
          {
            label: "Review ingredients for groceries",
            onPress: () => router.push({ pathname: "/meal-ingredients", params: { weekStart } }),
          },
          {
            label: "Cooking preferences and visible slots",
            onPress: () => router.push("/cooking-preferences"),
          },
          { label: "Refresh week", onPress: refresh, disabled: busy },
        ]}
      />
    </View>
  );
}
