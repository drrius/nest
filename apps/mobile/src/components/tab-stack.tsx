import { View } from "react-native";
import { Link } from "expo-router";
import { Stack } from "expo-router/stack";
import { useQuiet } from "../theme";

function HeaderActions() {
  const colors = useQuiet();
  const style = { color: colors.accent, fontSize: 17, padding: 12 };
  return (
    <View style={{ flexDirection: "row" }}>
      <Link href="/assistant" accessibilityLabel="Open private assistant" style={style}>
        Ask
      </Link>
      <Link href="/settings" accessibilityLabel="Open profile and settings" style={style}>
        Profile
      </Link>
    </View>
  );
}

export function TabStack({ title, route }: { title: string; route: string }) {
  const colors = useQuiet();
  return (
    <Stack
      screenOptions={{
        headerLargeTitleEnabled: true,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
        headerRight: HeaderActions,
      }}
    >
      <Stack.Screen name={route} options={{ title }} />
    </Stack>
  );
}
