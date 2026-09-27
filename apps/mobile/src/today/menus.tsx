import { NativeAction } from "../components/native-action";
import { Link } from "expo-router";
import { View } from "react-native";
import { TodayAddActions } from "./add-actions";
import { todayMoreActions } from "./more-actions";
export function TodayMenus({
  transfers: _transfers,
  refresh,
}: {
  transfers: number;
  refresh: () => void;
}) {
  return (
    <View>
      <TodayAddActions />
      <NativeAction label="Refresh and retry chores" onPress={refresh} />
      {todayMoreActions.map((action) => (
        <Link key={action.href} href={action.href}>
          {action.label}
        </Link>
      ))}
    </View>
  );
}
