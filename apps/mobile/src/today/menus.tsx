import { Link } from "expo-router";
import { View } from "react-native";
import { TodayAddActions } from "./add-actions";
import { todayMoreActions } from "./more-actions";
export function TodayMenus({ transfers: _transfers }: { transfers: number }) {
  return (
    <View>
      <TodayAddActions />
      {todayMoreActions.map((action) => (
        <Link key={action.href} href={action.href}>
          {action.label}
        </Link>
      ))}
    </View>
  );
}
