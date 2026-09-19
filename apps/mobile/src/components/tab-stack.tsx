import { Link } from "expo-router";
import { Stack } from "expo-router/stack";
import { useQuiet } from "../theme";

function ProfileLink() {
  const colors = useQuiet();
  return (
    <Link
      href="/preview-settings"
      accessibilityLabel="Open preview settings"
      style={{ color: colors.accent, fontSize: 17, padding: 12 }}
    >
      Profile
    </Link>
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
        headerRight: ProfileLink,
      }}
    >
      <Stack.Screen name={route} options={{ title }} />
    </Stack>
  );
}
