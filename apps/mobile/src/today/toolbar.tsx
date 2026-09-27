import { Text, View } from "react-native";
import SegmentedControl from "@expo/ui/community/segmented-control";
import { space, useQuiet } from "../theme";
import { TodayMenus } from "./menus";
export function TodayToolbar({
  everyone,
  select,
  transfers,
  date,
}: {
  everyone: boolean;
  select: (value: boolean) => void;
  transfers: number;
  date: string;
}) {
  const colors = useQuiet();
  const label = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return (
    <View style={{ gap: space.medium }}>
      <Text style={{ color: colors.muted, fontSize: 15 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 19 }}>A good day to keep it simple.</Text>
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: space.small, flexWrap: "wrap" }}
      >
        <SegmentedControl
          values={["Me + shared", "Everyone"]}
          selectedIndex={everyone ? 1 : 0}
          onChange={(event) => select(event.nativeEvent.selectedSegmentIndex === 1)}
          style={{ flexGrow: 1, minWidth: 220, minHeight: 44 }}
        />
        <TodayMenus transfers={transfers} />
      </View>
    </View>
  );
}
