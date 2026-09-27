import { Pressable, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Link } from "expo-router";
import { Stack } from "expo-router/stack";
import { useQuiet } from "../theme";

function HeaderActions() {
  const colors = useQuiet();
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      <Link href="/assistant" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open private assistant"
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <SymbolView name="bubble.left" tintColor={colors.accent} size={22} />
        </Pressable>
      </Link>
      <Link href="/settings" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open profile and settings"
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <SymbolView name="person.crop.circle" tintColor={colors.accent} size={24} />
        </Pressable>
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
        headerLargeTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        headerTransparent: true,
        headerLargeStyle: { backgroundColor: "transparent" },
        headerLargeTitleShadowVisible: false,
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
        headerRight: () => <HeaderActions />,
      }}
    >
      <Stack.Screen name={route} options={{ title }} />
    </Stack>
  );
}
